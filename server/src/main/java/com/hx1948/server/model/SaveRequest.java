package com.hx1948.server.model;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * 保存请求。expectedVersion 语义：
 *   null  — 仅自动存档允许（强制覆盖）；
 *   0     — 要求槽位当前不存在（新建）；
 *   >0    — 要求与数据库当前版本一致，不一致返回 409。
 */
public record SaveRequest(String slotName, JsonNode state, Integer expectedVersion) {
}
