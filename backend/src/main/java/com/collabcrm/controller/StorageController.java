package com.collabcrm.controller;

import com.collabcrm.service.StorageService;
import com.collabcrm.service.StorageService.FileInfo;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/storage")
public class StorageController {

    private final StorageService storageService;

    public StorageController(StorageService storageService) {
        this.storageService = storageService;
    }

    @GetMapping("/files")
    public List<FileInfo> listFiles(@RequestParam(defaultValue = "") String path) throws IOException {
        return storageService.listFiles(path);
    }

    @PostMapping("/folder")
    @ResponseStatus(HttpStatus.CREATED)
    public void createFolder(@RequestBody Map<String, String> body) throws IOException {
        storageService.createFolder(
                body.getOrDefault("path", ""),
                body.get("name")
        );
    }

    @PutMapping("/rename")
    public void rename(@RequestBody Map<String, String> body) throws IOException {
        storageService.rename(
                body.getOrDefault("path", ""),
                body.get("oldName"),
                body.get("newName")
        );
    }

    @PostMapping("/upload")
    @ResponseStatus(HttpStatus.CREATED)
    public void upload(
            @RequestParam(defaultValue = "") String path,
            @RequestParam("file") MultipartFile file) throws IOException {
        storageService.uploadFile(path, file.getOriginalFilename(), file.getInputStream());
    }

    @DeleteMapping("/delete")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@RequestParam String path, @RequestParam String name) throws IOException {
        storageService.delete(path, name);
    }

    @GetMapping("/download")
    public ResponseEntity<InputStreamResource> download(@RequestParam String path) throws IOException {
        InputStream is = storageService.downloadFile(path);
        String filename = path.contains("/") ? path.substring(path.lastIndexOf("/") + 1) : path;
        String encoded = URLEncoder.encode(filename, StandardCharsets.UTF_8).replace("+", "%20");

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encoded)
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(new InputStreamResource(is));
    }
}
