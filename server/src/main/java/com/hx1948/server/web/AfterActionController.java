package com.hx1948.server.web;

import com.hx1948.server.model.AfterActionRequest;
import com.hx1948.server.model.AfterActionView;
import com.hx1948.server.service.AfterActionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/after-actions")
public class AfterActionController {

    private final AfterActionService service;

    public AfterActionController(AfterActionService service) {
        this.service = service;
    }

    @GetMapping
    public List<AfterActionView> list(@RequestParam(defaultValue = "50") int limit) {
        return service.list(limit);
    }

    @PostMapping
    public ResponseEntity<AfterActionView> record(@RequestBody AfterActionRequest request) {
        AfterActionView view = service.record(request);
        return ResponseEntity.status(view.created() ? 201 : 200).body(view);
    }
}
