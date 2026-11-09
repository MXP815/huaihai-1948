package com.hx1948.server.model;

import java.time.Instant;

/** 列表用的存档摘要，不含 state 主体。 */
public record SaveSummary(
        String slot,
        String slotName,
        int version,
        double campaignT,
        int phase,
        int stateBytes,
        Instant createdAt,
        Instant updatedAt
) {
}
