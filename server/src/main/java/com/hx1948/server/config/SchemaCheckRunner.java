package com.hx1948.server.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * 启动时校验：schema.sql 执行后，两张表和全部必需列必须存在，否则拒绝启动。
 * 用 SELECT * WHERE 1=0 读列名，MySQL / H2 都可移植。
 */
@Component
public class SchemaCheckRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(SchemaCheckRunner.class);

    private static final Map<String, List<String>> REQUIRED = new LinkedHashMap<>();

    static {
        REQUIRED.put("save_slot", List.of(
                "id", "slot", "slot_name", "version", "campaign_t", "phase",
                "state_json", "state_bytes", "state_hash", "created_at", "updated_at"));
        REQUIRED.put("after_action", List.of(
                "id", "record_key", "ending_type", "ending_title", "ending_date", "campaign_t",
                "enemies_destroyed", "own_casualties", "key_divergence", "note", "created_at"));
    }

    private final DataSource dataSource;

    public SchemaCheckRunner(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        try (Connection conn = dataSource.getConnection()) {
            String product = conn.getMetaData().getDatabaseProductName();
            for (Map.Entry<String, List<String>> entry : REQUIRED.entrySet()) {
                Set<String> actual = columnsOf(conn, entry.getKey());
                if (actual.isEmpty()) {
                    throw new IllegalStateException("表 " + entry.getKey() + " 不存在，请确认 schema.sql 已执行");
                }
                List<String> missing = new ArrayList<>();
                for (String col : entry.getValue()) {
                    if (!actual.contains(col.toLowerCase())) missing.add(col);
                }
                if (!missing.isEmpty()) {
                    throw new IllegalStateException("表 " + entry.getKey() + " 缺少列：" + missing
                            + "（实际列：" + new TreeSet<>(actual) + "）");
                }
                log.info("schema 校验通过：{}.{} 列齐全", entry.getKey(), entry.getValue().size());
            }
            log.info("数据库连接正常：{}", product);
        }
    }

    private Set<String> columnsOf(Connection conn, String table) {
        Set<String> out = new HashSet<>();
        try (Statement st = conn.createStatement();
             var rs = st.executeQuery("SELECT * FROM " + table + " WHERE 1 = 0")) {
            ResultSetMetaData md = rs.getMetaData();
            for (int i = 1; i <= md.getColumnCount(); i++) {
                out.add(md.getColumnLabel(i).toLowerCase());
            }
        } catch (Exception e) {
            return out; // 表不存在
        }
        return out;
    }
}
