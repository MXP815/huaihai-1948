package com.hx1948.server.model;

import java.time.Instant;

public record AfterActionRequest(
        String endingType,
        String endingTitle,
        String endingDate,
        Double campaignT,
        Integer enemiesDestroyed,
        Integer ownCasualties,
        String keyDivergence,
        String note
) {
}
