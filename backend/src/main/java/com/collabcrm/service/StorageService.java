package com.collabcrm.service;

import com.hierynomus.msdtyp.AccessMask;
import com.hierynomus.msfscc.FileAttributes;
import com.hierynomus.msfscc.fileinformation.FileIdBothDirectoryInformation;
import com.hierynomus.mssmb2.SMB2CreateDisposition;
import com.hierynomus.mssmb2.SMB2CreateOptions;
import com.hierynomus.mssmb2.SMB2ShareAccess;
import com.hierynomus.smbj.SMBClient;
import com.hierynomus.smbj.auth.AuthenticationContext;
import com.hierynomus.smbj.connection.Connection;
import com.hierynomus.smbj.session.Session;
import com.hierynomus.smbj.share.DiskShare;
import com.hierynomus.smbj.share.File;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.*;

@Service
public class StorageService {

    @Value("${smb.host}")
    private String host;

    @Value("${smb.share}")
    private String shareName;

    @Value("${smb.base-path}")
    private String basePath;

    @Value("${smb.username}")
    private String username;

    @Value("${smb.password}")
    private String password;

    public record FileInfo(String name, boolean directory, long size, long lastModified) {}

    public List<FileInfo> listFiles(String relativePath) throws IOException {
        String fullPath = buildPath(relativePath);
        try (SMBClient client = new SMBClient();
             Connection conn = client.connect(host);
             Session session = conn.authenticate(new AuthenticationContext(username, password.toCharArray(), null));
             DiskShare share = (DiskShare) session.connectShare(shareName)) {

            List<FileInfo> files = new ArrayList<>();
            for (FileIdBothDirectoryInformation info : share.list(fullPath)) {
                String name = info.getFileName();
                if (".".equals(name) || "..".equals(name)) continue;

                boolean isDir = (info.getFileAttributes() & FileAttributes.FILE_ATTRIBUTE_DIRECTORY.getValue()) != 0;
                long size = info.getEndOfFile();
                long modified = info.getLastWriteTime().toEpochMillis();
                files.add(new FileInfo(name, isDir, size, modified));
            }

            files.sort(Comparator.comparing((FileInfo f) -> !f.directory).thenComparing(FileInfo::name));
            return files;
        }
    }

    public InputStream downloadFile(String relativePath) throws IOException {
        String fullPath = buildPath(relativePath);
        SMBClient client = new SMBClient();
        Connection conn = client.connect(host);
        Session session = conn.authenticate(new AuthenticationContext(username, password.toCharArray(), null));
        DiskShare share = (DiskShare) session.connectShare(shareName);

        File file = share.openFile(
                fullPath,
                EnumSet.of(AccessMask.GENERIC_READ),
                null,
                EnumSet.of(SMB2ShareAccess.FILE_SHARE_READ),
                SMB2CreateDisposition.FILE_OPEN,
                null
        );

        return file.getInputStream();
    }

    public void createFolder(String relativePath, String folderName) throws IOException {
        String parentPath = buildPath(relativePath);
        validateName(folderName);
        String fullPath = parentPath + "\\" + folderName;
        try (SMBClient client = new SMBClient();
             Connection conn = client.connect(host);
             Session session = conn.authenticate(new AuthenticationContext(username, password.toCharArray(), null));
             DiskShare share = (DiskShare) session.connectShare(shareName)) {
            share.mkdir(fullPath);
        }
    }

    public void rename(String relativePath, String oldName, String newName) throws IOException {
        validateName(newName);
        String parentPath = buildPath(relativePath);
        String oldPath = parentPath + "\\" + oldName;
        String newPath = parentPath + "\\" + newName;
        try (SMBClient client = new SMBClient();
             Connection conn = client.connect(host);
             Session session = conn.authenticate(new AuthenticationContext(username, password.toCharArray(), null));
             DiskShare share = (DiskShare) session.connectShare(shareName)) {

            // Check if it's a directory or file and rename accordingly
            if (share.folderExists(oldPath)) {
                try (var dir = share.openDirectory(oldPath,
                        EnumSet.of(AccessMask.GENERIC_ALL),
                        null,
                        EnumSet.of(SMB2ShareAccess.FILE_SHARE_READ),
                        SMB2CreateDisposition.FILE_OPEN,
                        null)) {
                    dir.rename(newPath);
                }
            } else {
                try (var file = share.openFile(oldPath,
                        EnumSet.of(AccessMask.GENERIC_ALL),
                        null,
                        EnumSet.of(SMB2ShareAccess.FILE_SHARE_READ),
                        SMB2CreateDisposition.FILE_OPEN,
                        null)) {
                    file.rename(newPath);
                }
            }
        }
    }

    public void uploadFile(String relativePath, String fileName, InputStream data) throws IOException {
        validateName(fileName);
        String parentPath = buildPath(relativePath);
        String fullPath = parentPath + "\\" + fileName;
        try (SMBClient client = new SMBClient();
             Connection conn = client.connect(host);
             Session session = conn.authenticate(new AuthenticationContext(username, password.toCharArray(), null));
             DiskShare share = (DiskShare) session.connectShare(shareName);
             File file = share.openFile(
                     fullPath,
                     EnumSet.of(AccessMask.GENERIC_WRITE),
                     EnumSet.of(FileAttributes.FILE_ATTRIBUTE_NORMAL),
                     EnumSet.of(SMB2ShareAccess.FILE_SHARE_WRITE),
                     SMB2CreateDisposition.FILE_OVERWRITE_IF,
                     EnumSet.of(SMB2CreateOptions.FILE_NON_DIRECTORY_FILE));
             OutputStream os = file.getOutputStream()) {
            data.transferTo(os);
        }
    }

    public void delete(String relativePath, String name) throws IOException {
        String parentPath = buildPath(relativePath);
        String fullPath = parentPath + "\\" + name;
        try (SMBClient client = new SMBClient();
             Connection conn = client.connect(host);
             Session session = conn.authenticate(new AuthenticationContext(username, password.toCharArray(), null));
             DiskShare share = (DiskShare) session.connectShare(shareName)) {
            if (share.folderExists(fullPath)) {
                share.rmdir(fullPath, true);
            } else {
                share.rm(fullPath);
            }
        }
    }

    private void validateName(String name) {
        if (name == null || name.isBlank() || name.contains("\\") || name.contains("/") || name.contains("..")) {
            throw new IllegalArgumentException("Invalid name: " + name);
        }
    }

    private String buildPath(String relativePath) {
        if (relativePath == null || relativePath.isBlank()) {
            return basePath;
        }
        // Prevent path traversal
        String cleaned = relativePath.replace("/", "\\").replaceAll("\\\\+", "\\\\");
        if (cleaned.contains("..")) {
            throw new IllegalArgumentException("Invalid path");
        }
        return basePath + "\\" + cleaned;
    }
}
