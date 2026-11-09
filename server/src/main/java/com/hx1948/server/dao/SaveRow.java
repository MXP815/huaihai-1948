package com.hx1948.server.dao;

import java.time.Instant;

/** 数据库行（state 以原始 JSON 文本保存，避免二次序列化改变字节）。 */
public record SaveRow(
        String slot,
        String slotName,
        int version,
        double campaignT,
        int phase,
        String stateJson,
        int stateBytes,
        String stateHash,
        Instant createdAt,
        Instant updatedAt
) {
}
