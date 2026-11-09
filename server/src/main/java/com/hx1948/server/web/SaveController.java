package com.hx1948.server.web;

import com.hx1948.server.model.SaveDetail;
import com.hx1948.server.model.SaveRequest;
import com.hx1948.server.model.SaveResult;
import com.hx1948.server.model.SaveSummary;
import com.hx1948.server.service.SaveService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/saves")
public class SaveController {

    private final SaveService service;

    public SaveController(SaveService service) {
        this.service = service;
    }

    @GetMapping
    public List<SaveSummary> list() {
        return service.list();
    }

    @GetMapping("/{slot}")
    public SaveDetail get(@PathVariable String slot) {
        return service.get(slot);
    }

    @PutMapping("/{slot}")
    public ResponseEntity<SaveResult> save(@PathVariable String slot, @RequestBody SaveRequest request) {
        SaveResult result = service.save(slot, request, false);
        return ResponseEntity.status(result.created() ? 201 : 200).body(result);
    }

    /** 自动存档：槽位固定 auto，允许不带 expectedVersion 直接覆盖。 */
    @PostMapping("/auto")
    public ResponseEntity<SaveResult> autoSave(@RequestBody SaveRequest request) {
        SaveResult result = service.save(SaveService.AUTO_SLOT, request, true);
        return ResponseEntity.status(result.created() ? 201 : 200).body(result);
    }

    @DeleteMapping("/{slot}")
    public ResponseEntity<Void> delete(@PathVariable String slot) {
        service.delete(slot);
        return ResponseEntity.noContent().build();
    }
}
