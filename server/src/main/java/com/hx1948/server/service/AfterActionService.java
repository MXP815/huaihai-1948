package com.hx1948.server.service;

import com.hx1948.server.dao.AfterActionDao;
import com.hx1948.server.model.AfterActionRequest;
import com.hx1948.server.model.AfterActionView;
import com.hx1948.server.web.ApiException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Locale;

@Service
public class AfterActionService {

    private final AfterActionDao dao;

    public AfterActionService(AfterActionDao dao) {
        this.dao = dao;
    }

    public List<AfterActionView> list(int limit) {
        int n = Math.max(1, Math.min(limit, 200));
        return dao.findRecent(n).stream().map(r -> toView(r, false)).toList();
    }

    /** 同一结局（类型+战役时间+歼敌+伤亡）重复上报只记一次，返回已有记录。 */
    public AfterActionView record(AfterActionRequest req) {
        if (req == null || req.endingType() == null || req.endingType().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_after_action", "缺少 endingType");
        }
        String type = req.endingType().trim().toLowerCase(Locale.ROOT);
        String title = req.endingTitle() == null ? "" : trim(req.endingTitle(), 128);
        String date = req.endingDate() == null ? "" : trim(req.endingDate(), 24);
        double campaignT = req.campaignT() == null ? 0d : req.campaignT();
        int enemies = req.enemiesDestroyed() == null ? 0 : Math.max(0, req.enemiesDestroyed());
        int casualties = req.ownCasualties() == null ? 0 : Math.max(0, req.ownCasualties());
        String divergence = req.keyDivergence() == null ? "" : trim(req.keyDivergence(), 512);
        String note = req.note() == null ? "" : trim(req.note(), 1024);

        String key = SaveService.sha256(type + "|" + Math.round(campaignT * 1000) + "|" + enemies + "|" + casualties);

        AfterActionDao.Row row = new AfterActionDao.Row(
                0L, key, type, title, date, campaignT, enemies, casualties, divergence, note, Instant.now());

        var existing = dao.findByKey(key);
        if (existing.isPresent()) return toView(existing.get(), false);
        try {
            dao.insert(row);
        } catch (DuplicateKeyException e) {
            return dao.findByKey(key).map(r -> toView(r, false)).orElseThrow(() -> e);
        }
        return dao.findByKey(key).map(r -> toView(r, true)).orElseThrow();
    }

    private static AfterActionView toView(AfterActionDao.Row r, boolean created) {
        return new AfterActionView(r.id(), r.endingType(), r.endingTitle(), r.endingDate(), r.campaignT(),
                r.enemiesDestroyed(), r.ownCasualties(), r.keyDivergence(), r.note(), r.createdAt(), created);
    }

    private static String trim(String s, int max) {
        String t = s.trim();
        return t.length() <= max ? t : t.substring(0, max);
    }
}
