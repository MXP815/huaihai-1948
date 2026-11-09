package com.hx1948.server.dao;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public class SaveDao {

    private static final String COLUMNS =
            "slot, slot_name, version, campaign_t, phase, state_json, state_bytes, state_hash, created_at, updated_at";

    private static final RowMapper<SaveRow> MAPPER = (rs, i) -> new SaveRow(
            rs.getString("slot"),
            rs.getString("slot_name"),
            rs.getInt("version"),
            rs.getDouble("campaign_t"),
            rs.getInt("phase"),
            rs.getString("state_json"),
            rs.getInt("state_bytes"),
            rs.getString("state_hash"),
            toInstant(rs.getTimestamp("created_at")),
            toInstant(rs.getTimestamp("updated_at")));

    private final JdbcTemplate jdbc;

    public SaveDao(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<SaveRow> findAll() {
        return jdbc.query("SELECT " + COLUMNS + " FROM save_slot ORDER BY updated_at DESC, id DESC", MAPPER);
    }

    public Optional<SaveRow> find(String slot) {
        List<SaveRow> rows = jdbc.query("SELECT " + COLUMNS + " FROM save_slot WHERE slot = ?", MAPPER, slot);
        return rows.stream().findFirst();
    }

    public int insert(SaveRow row) {
        return jdbc.update("INSERT INTO save_slot (slot, slot_name, version, campaign_t, phase, state_json, state_bytes, state_hash, created_at, updated_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                row.slot(), row.slotName(), row.version(), row.campaignT(), row.phase(),
                row.stateJson(), row.stateBytes(), row.stateHash(),
                Timestamp.from(row.createdAt()), Timestamp.from(row.updatedAt()));
    }

    /** 乐观锁：只有 version 仍等于 expectedVersion 时才更新，返回受影响行数。 */
    public int update(String slot, int expectedVersion, String slotName, double campaignT, int phase,
                      String stateJson, int stateBytes, String stateHash, Instant updatedAt) {
        return jdbc.update("UPDATE save_slot SET slot_name = ?, campaign_t = ?, phase = ?, state_json = ?, "
                        + "state_bytes = ?, state_hash = ?, version = version + 1, updated_at = ? "
                        + "WHERE slot = ? AND version = ?",
                slotName, campaignT, phase, stateJson, stateBytes, stateHash,
                Timestamp.from(updatedAt), slot, expectedVersion);
    }

    public int delete(String slot) {
        return jdbc.update("DELETE FROM save_slot WHERE slot = ?", slot);
    }

    private static Instant toInstant(Timestamp ts) {
        return ts == null ? null : ts.toInstant();
    }
}
