package com.hx1948.server.dao;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public class AfterActionDao {

    public record Row(
            long id, String recordKey, String endingType, String endingTitle, String endingDate,
            double campaignT, int enemiesDestroyed, int ownCasualties, String keyDivergence,
            String note, Instant createdAt
    ) {
    }

    private static final String COLUMNS = "id, record_key, ending_type, ending_title, ending_date, campaign_t, "
            + "enemies_destroyed, own_casualties, key_divergence, note, created_at";

    private static final RowMapper<Row> MAPPER = (rs, i) -> new Row(
            rs.getLong("id"),
            rs.getString("record_key"),
            rs.getString("ending_type"),
            rs.getString("ending_title"),
            rs.getString("ending_date"),
            rs.getDouble("campaign_t"),
            rs.getInt("enemies_destroyed"),
            rs.getInt("own_casualties"),
            rs.getString("key_divergence"),
            rs.getString("note"),
            rs.getTimestamp("created_at") == null ? null : rs.getTimestamp("created_at").toInstant());

    private final JdbcTemplate jdbc;

    public AfterActionDao(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Row> findByKey(String recordKey) {
        List<Row> rows = jdbc.query("SELECT " + COLUMNS + " FROM after_action WHERE record_key = ?", MAPPER, recordKey);
        return rows.stream().findFirst();
    }

    public List<Row> findRecent(int limit) {
        return jdbc.query("SELECT " + COLUMNS + " FROM after_action ORDER BY created_at DESC, id DESC LIMIT ?",
                MAPPER, limit);
    }

    public int insert(Row row) {
        return jdbc.update("INSERT INTO after_action (record_key, ending_type, ending_title, ending_date, campaign_t, "
                        + "enemies_destroyed, own_casualties, key_divergence, note, created_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                row.recordKey(), row.endingType(), row.endingTitle(), row.endingDate(), row.campaignT(),
                row.enemiesDestroyed(), row.ownCasualties(), row.keyDivergence(), row.note(),
                Timestamp.from(row.createdAt()));
    }
}
