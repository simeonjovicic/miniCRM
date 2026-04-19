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

    @PostMapping("/upload/batch")
    @ResponseStatus(HttpStatus.CREATED)
    public void uploadBatch(
            @RequestParam(defaultValue = "") String path,
            @RequestParam("files") MultipartFile[] files) throws IOException {
        storageService.uploadFiles(path, files);
    }

    @DeleteMapping("/delete")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@RequestParam String path, @RequestParam String name) throws IOException {
        storageService.delete(path, name);
    }

    @GetMapping("/search")
    public List<FileInfo> searchFiles(@RequestParam String q) throws IOException {
        return storageService.searchFiles(q);
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

    @GetMapping("/preview")
    public ResponseEntity<InputStreamResource> preview(@RequestParam String path) throws IOException {
        InputStream is = storageService.downloadFile(path);
        String filename = path.contains("/") ? path.substring(path.lastIndexOf("/") + 1) : path;
        String encoded = URLEncoder.encode(filename, StandardCharsets.UTF_8).replace("+", "%20");
        MediaType mediaType = guessMediaType(filename);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename*=UTF-8''" + encoded)
                .contentType(mediaType)
                .body(new InputStreamResource(is));
    }

    private MediaType guessMediaType(String filename) {
        String ext = filename.contains(".") ? filename.substring(filename.lastIndexOf('.') + 1).toLowerCase() : "";
        return switch (ext) {
            case "pdf" -> MediaType.APPLICATION_PDF;
            case "jpg", "jpeg" -> MediaType.IMAGE_JPEG;
            case "png" -> MediaType.IMAGE_PNG;
            case "gif" -> MediaType.IMAGE_GIF;
            case "svg" -> MediaType.parseMediaType("image/svg+xml");
            case "webp" -> MediaType.parseMediaType("image/webp");
            case "mp4" -> MediaType.parseMediaType("video/mp4");
            case "webm" -> MediaType.parseMediaType("video/webm");
            case "mp3" -> MediaType.parseMediaType("audio/mpeg");
            case "wav" -> MediaType.parseMediaType("audio/wav");
            case "ogg" -> MediaType.parseMediaType("audio/ogg");
            case "json" -> MediaType.APPLICATION_JSON;
            case "xml" -> MediaType.APPLICATION_XML;
            case "html" -> MediaType.TEXT_HTML;
            case "css", "js", "ts", "txt", "csv", "md", "yml", "yaml", "log", "sh" -> MediaType.TEXT_PLAIN;
            default -> MediaType.APPLICATION_OCTET_STREAM;
        };
    }
}
