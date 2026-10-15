package com.pedreiraflix.app;

import android.app.DownloadManager;
import android.content.Context;
import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import androidx.activity.result.ActivityResult;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.zip.CRC32;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONException;

/**
 * Download em segundo plano pelo gerenciador de downloads do proprio Android: notificacao com progresso,
 * continua com o app fechado ou a tela apagada, e o arquivo fica na pasta do app (sem pedir permissao;
 * some se o app for desinstalado). O site chama isto pelo src/lib/nativeDownloads.ts so dentro do APK.
 */
@CapacitorPlugin(name = "Baixador")
public class BaixadorPlugin extends Plugin {

    private DownloadManager dm() {
        return (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
    }

    @PluginMethod
    public void start(PluginCall call) {
        String url = call.getString("url");
        String fileName = call.getString("fileName");
        if (url == null || fileName == null) {
            call.reject("url e fileName sao obrigatorios");
            return;
        }
        // So o nome do arquivo, dentro da pasta do app: "../" levaria o download para fora dela.
        if (fileName.contains("/") || fileName.contains("\\") || fileName.contains("..")) {
            call.reject("fileName invalido");
            return;
        }
        if (!url.startsWith("https://") && !url.startsWith("http://")) {
            call.reject("url invalida");
            return;
        }
        DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url))
            .setTitle(call.getString("title", "PedreiraFlix"))
            .setDescription("PedreiraFlix")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_MOVIES, fileName);
        JSObject ret = new JSObject();
        ret.put("id", dm().enqueue(req));
        call.resolve(ret);
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSArray ids = call.getArray("ids", new JSArray());
        JSArray out = new JSArray();
        try {
            for (int i = 0; i < ids.length(); i++) {
                long id = ids.getLong(i);
                JSObject d = new JSObject();
                d.put("id", id);
                try (Cursor c = dm().query(new DownloadManager.Query().setFilterById(id))) {
                    if (c == null || !c.moveToFirst()) {
                        d.put("state", "missing");
                    } else {
                        int st = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                        d.put("state", st == DownloadManager.STATUS_SUCCESSFUL ? "done" : st == DownloadManager.STATUS_FAILED ? "failed" : "running");
                        d.put("bytes", c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)));
                        d.put("total", c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)));
                        d.put("reason", c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON)));
                        d.put("uri", c.getString(c.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI)));
                    }
                }
                out.put(d);
            }
        } catch (JSONException e) {
            call.reject("ids invalidos", e);
            return;
        }
        JSObject ret = new JSObject();
        ret.put("downloads", out);
        call.resolve(ret);
    }

    /** Cancela se ainda estiver baixando e apaga o arquivo. */
    @PluginMethod
    public void remove(PluginCall call) {
        Long id = call.getLong("id");
        if (id != null) dm().remove(id);
        call.resolve();
    }

    /**
     * Junta episodios ja baixados num .zip (sem compressao, ZIP64 quando passa de 4 GB) no lugar que o usuario
     * escolher na janela "Salvar como" do Android. ids = downloads do gerenciador; paths = caminho de cada um
     * dentro do zip ("Serie/Temporada 01/E01 - ...mp4").
     */
    @PluginMethod
    public void zip(PluginCall call) {
        JSArray ids = call.getArray("ids", new JSArray());
        JSArray paths = call.getArray("paths", new JSArray());
        String fileName = call.getString("fileName", "serie.zip");
        if (ids.length() == 0 || ids.length() != paths.length()) {
            call.reject("ids e paths invalidos");
            return;
        }
        try {
            for (int i = 0; i < paths.length(); i++) {
                String p = paths.getString(i);
                if (p.startsWith("/") || p.contains("..") || p.contains("\\")) {
                    call.reject("caminho invalido");
                    return;
                }
            }
        } catch (JSONException e) {
            call.reject("paths invalidos", e);
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("application/zip")
            .putExtra(Intent.EXTRA_TITLE, fileName);
        startActivityForResult(call, intent, "zipDestino");
    }

    @ActivityCallback
    private void zipDestino(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("cancelado");
            return;
        }
        Uri dest = data.getData();
        JSArray ids = call.getArray("ids", new JSArray());
        JSArray paths = call.getArray("paths", new JSArray());
        new Thread(() -> {
            try (OutputStream out = getContext().getContentResolver().openOutputStream(dest)) {
                if (out == null) throw new IOException("sem destino");
                long total = writeZip(out, ids, paths);
                JSObject ret = new JSObject();
                ret.put("bytes", total);
                call.resolve(ret);
            } catch (Exception e) {
                // Zip pela metade e pior que nenhum: apaga o que ficou no destino.
                try {
                    android.provider.DocumentsContract.deleteDocument(getContext().getContentResolver(), dest);
                } catch (Exception ignored) {
                }
                call.reject("falha ao montar o zip: " + e.getMessage(), e);
            }
        }).start();
    }

    private static ByteBuffer buf(int n) {
        return ByteBuffer.allocate(n).order(ByteOrder.LITTLE_ENDIAN);
    }

    private ParcelFileDescriptor open(long id) throws IOException {
        ParcelFileDescriptor fd = dm().openDownloadedFile(id);
        if (fd == null) throw new IOException("arquivo ausente");
        return fd;
    }

    private long writeZip(OutputStream rawOut, JSArray ids, JSArray paths) throws Exception {
        final long[] written = {0};
        OutputStream out = new OutputStream() {
            @Override public void write(int b) throws IOException { rawOut.write(b); written[0]++; }
            @Override public void write(byte[] b, int o, int l) throws IOException { rawOut.write(b, o, l); written[0] += l; }
        };
        Calendar c = Calendar.getInstance();
        int time = (c.get(Calendar.HOUR_OF_DAY) << 11) | (c.get(Calendar.MINUTE) << 5) | (c.get(Calendar.SECOND) >> 1);
        int date = ((c.get(Calendar.YEAR) - 1980) << 9) | ((c.get(Calendar.MONTH) + 1) << 5) | c.get(Calendar.DAY_OF_MONTH);
        final long M = 0xffffffffL;
        ArrayList<byte[]> central = new ArrayList<>();
        byte[] chunk = new byte[256 * 1024];
        int count = ids.length();

        for (int i = 0; i < count; i++) {
            long id = ids.getLong(i);
            byte[] name = paths.getString(i).getBytes(StandardCharsets.UTF_8);
            // 1a leitura: tamanho e CRC (o cabecalho local precisa dos dois antes dos dados).
            CRC32 crc = new CRC32();
            long size = 0;
            try (ParcelFileDescriptor pfd = open(id); InputStream in = new FileInputStream(pfd.getFileDescriptor())) {
                for (int n; (n = in.read(chunk)) > 0; ) { crc.update(chunk, 0, n); size += n; }
            }
            boolean big = size >= M;
            boolean bigOffset = written[0] >= M;
            int lextra = big ? 20 : 0;
            ByteBuffer l = buf(30 + name.length + lextra);
            l.putInt(0x04034b50).putShort((short) (big ? 45 : 20)).putShort((short) 0x0800).putShort((short) 0)
                .putShort((short) time).putShort((short) date).putInt((int) crc.getValue())
                .putInt(big ? -1 : (int) size).putInt(big ? -1 : (int) size)
                .putShort((short) name.length).putShort((short) lextra).put(name);
            if (big) l.putShort((short) 1).putShort((short) 16).putLong(size).putLong(size);
            long offset = written[0];
            out.write(l.array());

            // 2a leitura: os dados.
            long copied = 0;
            try (ParcelFileDescriptor pfd = open(id); InputStream in = new FileInputStream(pfd.getFileDescriptor())) {
                for (int n; (n = in.read(chunk)) > 0; ) { out.write(chunk, 0, n); copied += n; }
            }
            if (copied != size) throw new IOException("arquivo mudou durante a leitura");

            int cextra = (big ? 16 : 0) + (bigOffset ? 8 : 0);
            ByteBuffer ce = buf(46 + name.length + (cextra > 0 ? 4 + cextra : 0));
            ce.putInt(0x02014b50).putShort((short) 45).putShort((short) (big || bigOffset ? 45 : 20)).putShort((short) 0x0800)
                .putShort((short) 0).putShort((short) time).putShort((short) date).putInt((int) crc.getValue())
                .putInt(big ? -1 : (int) size).putInt(big ? -1 : (int) size)
                .putShort((short) name.length).putShort((short) (cextra > 0 ? 4 + cextra : 0)).putShort((short) 0)
                .putShort((short) 0).putShort((short) 0).putInt(0).putInt(bigOffset ? -1 : (int) offset).put(name);
            if (cextra > 0) {
                ce.putShort((short) 1).putShort((short) cextra);
                if (big) ce.putLong(size).putLong(size);
                if (bigOffset) ce.putLong(offset);
            }
            central.add(ce.array());

            JSObject p = new JSObject();
            p.put("done", i + 1);
            p.put("total", count);
            notifyListeners("zipProgress", p);
        }

        long cdOffset = written[0];
        long cdSize = 0;
        for (byte[] ce : central) { out.write(ce); cdSize += ce.length; }
        boolean bigEnd = cdOffset >= M;
        if (bigEnd) {
            ByteBuffer z = buf(76);
            z.putInt(0x06064b50).putLong(44).putShort((short) 45).putShort((short) 45).putInt(0).putInt(0)
                .putLong(count).putLong(count).putLong(cdSize).putLong(cdOffset)
                .putInt(0x07064b50).putInt(0).putLong(cdOffset + cdSize).putInt(1);
            out.write(z.array());
        }
        ByteBuffer e = buf(22);
        e.putInt(0x06054b50).putShort((short) 0).putShort((short) 0).putShort((short) Math.min(count, 0xffff))
            .putShort((short) Math.min(count, 0xffff)).putInt((int) cdSize).putInt(bigEnd ? -1 : (int) cdOffset).putShort((short) 0);
        out.write(e.array());
        out.flush();
        return written[0];
    }
}
