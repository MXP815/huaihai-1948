package com.hx1948.server.model;

import java.time.Instant;

public record SaveResult(
        String slot,
        String slotName,
        int version,
        boolean created,
        boolean idempotent,
        Instant updatedAt
) {
}
