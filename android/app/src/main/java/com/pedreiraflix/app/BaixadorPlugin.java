package com.pedreiraflix.app;

import android.app.DownloadManager;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
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
}
