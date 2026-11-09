package com.hx1948.server.model;

import java.time.Instant;

public record AfterActionView(
        long id,
        String endingType,
        String endingTitle,
        String endingDate,
        double campaignT,
        int enemiesDestroyed,
        int ownCasualties,
        String keyDivergence,
        String note,
        Instant createdAt,
        boolean created
) {
}
