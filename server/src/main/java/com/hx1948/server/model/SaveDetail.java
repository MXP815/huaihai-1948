package com.hx1948.server.model;

import com.fasterxml.jackson.databind.JsonNode;

import java.time.Instant;

/** 单槽完整内容：state 即 S.serialize 产出的 {v, sim} 结构。 */
public record SaveDetail(
        String slot,
        String slotName,
        int version,
        double campaignT,
        int phase,
        int stateBytes,
        JsonNode state,
        Instant createdAt,
        Instant updatedAt
) {
}
