package com.waraqa.mindmap;

import android.Manifest;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(
    name = "Downloads",
    permissions = {
        @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
    }
)
public class DownloadsPlugin extends Plugin {
    @PluginMethod
    public void saveJson(PluginCall call) {
        String fileName = sanitizeFileName(call.getString("fileName", "mind-map.json"));
        String content = call.getString("content");
        if (content == null) {
            call.reject("JSON content is required");
            return;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "saveJsonAfterPermission");
            return;
        }

        writeJson(call, fileName, content);
    }

    @PermissionCallback
    private void saveJsonAfterPermission(PluginCall call) {
        if (getPermissionState("storage") != PermissionState.GRANTED) {
            call.reject("Storage permission was denied");
            return;
        }
        String fileName = sanitizeFileName(call.getString("fileName", "mind-map.json"));
        String content = call.getString("content");
        if (content == null) {
            call.reject("JSON content is required");
            return;
        }
        writeJson(call, fileName, content);
    }

    private void writeJson(PluginCall call, String fileName, String content) {
        try {
            byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
            Uri savedUri;
            String savedPath;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                values.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);

                savedUri = getContext().getContentResolver().insert(
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (savedUri == null) throw new IllegalStateException("Could not create download file");

                try (OutputStream output = getContext().getContentResolver().openOutputStream(savedUri)) {
                    if (output == null) throw new IllegalStateException("Could not open download file");
                    output.write(bytes);
                }
                values.clear();
                values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                getContext().getContentResolver().update(savedUri, values, null, null);
                savedPath = "Downloads/" + fileName;
            } else {
                File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!downloads.exists() && !downloads.mkdirs()) {
                    throw new IllegalStateException("Could not access Downloads folder");
                }
                File outputFile = new File(downloads, fileName);
                try (FileOutputStream output = new FileOutputStream(outputFile)) {
                    output.write(bytes);
                }
                savedPath = outputFile.getAbsolutePath();
                savedUri = Uri.fromFile(outputFile);
                getContext().sendBroadcast(new Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, savedUri));
            }

            JSObject result = new JSObject();
            result.put("uri", savedUri.toString());
            result.put("path", savedPath);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not save JSON to Downloads", error);
        }
    }

    private String sanitizeFileName(String value) {
        String fileName = value == null ? "mind-map.json" : value;
        fileName = fileName.replaceAll("[\\\\/:*?\"<>|]", "-").trim();
        if (fileName.isEmpty()) fileName = "mind-map.json";
        if (!fileName.toLowerCase().endsWith(".json")) fileName += ".json";
        return fileName;
    }
}
