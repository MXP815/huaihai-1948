package com.hx1948.server.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hx1948.server.dao.SaveDao;
import com.hx1948.server.dao.SaveRow;
import com.hx1948.server.model.SaveDetail;
import com.hx1948.server.model.SaveRequest;
import com.hx1948.server.model.SaveResult;
import com.hx1948.server.model.SaveSummary;
import com.hx1948.server.web.ApiException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@Service
public class SaveService {

    public static final String AUTO_SLOT = "auto";
    private static final Pattern SLOT_RE = Pattern.compile("[a-z0-9_-]{1,64}");

    private final SaveDao dao;
    private final ObjectMapper mapper;

    public SaveService(SaveDao dao, ObjectMapper mapper) {
        this.dao = dao;
        this.mapper = mapper;
    }

    public List<SaveSummary> list() {
        return dao.findAll().stream().map(r -> new SaveSummary(
                r.slot(), r.slotName(), r.version(), r.campaignT(), r.phase(),
                r.stateBytes(), r.createdAt(), r.updatedAt())).toList();
    }

    public SaveDetail get(String slot) {
        SaveRow row = dao.find(slot)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "not_found", "没有该存档槽：" + slot));
        JsonNode state;
        try {
            state = mapper.readTree(row.stateJson());
        } catch (Exception e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "state_corrupted",
                    "存档 state_json 无法解析：" + slot);
        }
        return new SaveDetail(row.slot(), row.slotName(), row.version(), row.campaignT(), row.phase(),
                row.stateBytes(), state, row.createdAt(), row.updatedAt());
    }

    /**
     * 保存（新建或覆盖）。
     *
     * @param auto true 表示自动存档（槽位固定 auto，允许 expectedVersion 为空时强制覆盖）
     */
    public SaveResult save(String slot, SaveRequest req, boolean auto) {
        if (!SLOT_RE.matcher(slot).matches()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_slot", "槽位名只允许 a-z0-9_-，长度 1-64");
        }
        if (!auto && slot.equals(AUTO_SLOT)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_slot", "auto 槽位只能通过 /api/saves/auto 写入");
        }
        if (req == null || req.state() == null || req.state().isNull()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_state", "缺少 state 字段");
        }
        JsonNode sim = req.state().get("sim");
        if (sim == null || !sim.isObject() || sim.get("pla") == null || !sim.get("pla").isArray()
                || sim.get("t") == null || !sim.get("t").isNumber()
                || sim.get("phase") == null || !sim.get("phase").isNumber()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_state",
                    "state 必须是 S.serialize 的结构：{v, sim:{t, phase, pla[]}}");
        }

        String json;
        try {
            json = mapper.writeValueAsString(req.state());
        } catch (Exception e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_state", "state 无法序列化为 JSON");
        }
        int bytes = json.getBytes(StandardCharsets.UTF_8).length;
        String hash = sha256(json);
        double campaignT = sim.get("t").asDouble();
        int phase = sim.get("phase").asInt();
        String slotName = req.slotName() == null || req.slotName().isBlank()
                ? (auto ? "自动存档" : "手动存档")
                : trimTo(req.slotName(), 128);
        Integer expected = req.expectedVersion();
        Instant now = Instant.now();

        SaveRow current = dao.find(slot).orElse(null);

        if (current == null) {
            if (expected != null && expected > 0) throw conflict(0);
            SaveRow row = new SaveRow(slot, slotName, 1, campaignT, phase, json, bytes, hash, now, now);
            try {
                dao.insert(row);
            } catch (DuplicateKeyException e) {
                // 并发新建：另一个请求已经插入
                throw conflict(dao.find(slot).map(SaveRow::version).orElse(0));
            }
            return new SaveResult(slot, slotName, 1, true, false, now);
        }

        if (!auto && expected == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "expected_version_required",
                    "覆盖已有存档必须带 expectedVersion（首次保存传 0）");
        }
        if (expected != null && expected != current.version()) {
            throw conflict(current.version());
        }
        // 内容与槽位名完全一致时视为重放：不升版本，直接返回当前记录（幂等）
        if (current.stateHash().equals(hash) && current.slotName().equals(slotName)) {
            return new SaveResult(slot, slotName, current.version(), false, true, current.updatedAt());
        }
        int affected = dao.update(slot, current.version(), slotName, campaignT, phase, json, bytes, hash, now);
        if (affected == 0) {
            throw conflict(dao.find(slot).map(SaveRow::version).orElse(current.version()));
        }
        return new SaveResult(slot, slotName, current.version() + 1, false, false, now);
    }

    public void delete(String slot) {
        if (dao.delete(slot) == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "not_found", "没有该存档槽：" + slot);
        }
    }

    private ApiException conflict(int currentVersion) {
        return new ApiException(HttpStatus.CONFLICT, "version_conflict",
                "存档版本不一致，可能已被其他会话覆盖", Map.of("currentVersion", currentVersion));
    }

    private static String trimTo(String s, int max) {
        String t = s.trim();
        return t.length() <= max ? t : t.substring(0, max);
    }

    static String sha256(String text) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(d.length * 2);
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }
}
