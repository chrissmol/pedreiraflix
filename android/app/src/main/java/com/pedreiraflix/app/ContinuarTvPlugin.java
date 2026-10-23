package com.pedreiraflix.app;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import androidx.tvprovider.media.tv.TvContractCompat;
import androidx.tvprovider.media.tv.WatchNextProgram;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Fileira "Continuar assistindo" da tela inicial do Google TV / Android TV (Watch Next): o site manda a lista do
 * perfil ativo pelo src/lib/continuarTv.ts e este plugin deixa a fileira igual a ela. Cada item abre o app direto no
 * video por pedreiraflix://abrir?path=/watch/... (ver MainActivity). No celular e no Fire TV nao faz nada.
 */
@CapacitorPlugin(name = "ContinuarTv")
public class ContinuarTvPlugin extends Plugin {

    /** Caminho que um item da fileira pediu para abrir antes de o site carregar (app fechado). */
    static String pendente = null;

    private boolean temFileira() {
        return getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_LEANBACK);
    }

    @PluginMethod
    public void atualizar(PluginCall call) {
        if (!temFileira()) {
            call.resolve();
            return;
        }
        JSArray itens = call.getArray("itens", new JSArray());
        ContentResolver cr = getContext().getContentResolver();
        try {
            // O que ja esta na fileira, pelo id do app (cada app so ve as proprias linhas).
            Map<String, Long> atuais = new HashMap<>();
            try (Cursor c = cr.query(TvContractCompat.WatchNextPrograms.CONTENT_URI, WatchNextProgram.PROJECTION, null, null, null)) {
                while (c != null && c.moveToNext()) {
                    WatchNextProgram p = WatchNextProgram.fromCursor(c);
                    if (p.getInternalProviderId() != null) atuais.put(p.getInternalProviderId(), p.getId());
                }
            }
            Set<String> manter = new HashSet<>();
            for (int i = 0; i < itens.length(); i++) {
                JSONObject it = itens.getJSONObject(i);
                String id = it.getString("id");
                String path = it.getString("path");
                if (!path.startsWith("/") || path.startsWith("//")) continue;
                manter.add(id);
                WatchNextProgram.Builder b = new WatchNextProgram.Builder();
                b.setType(it.optBoolean("episodio") ? TvContractCompat.WatchNextPrograms.TYPE_TV_EPISODE : TvContractCompat.WatchNextPrograms.TYPE_MOVIE)
                    .setWatchNextType(TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_CONTINUE)
                    .setLastEngagementTimeUtcMillis(it.getLong("quando"))
                    .setTitle(it.getString("titulo"))
                    .setIntentUri(new Uri.Builder().scheme("pedreiraflix").authority("abrir").appendQueryParameter("path", path).build())
                    .setInternalProviderId(id);
                String imagem = it.optString("imagem", "");
                if (imagem.startsWith("https://")) {
                    b.setPosterArtUri(Uri.parse(imagem));
                    b.setPosterArtAspectRatio(TvContractCompat.PreviewPrograms.ASPECT_RATIO_2_3);
                }
                long duracao = it.optLong("duracaoMs", 0);
                if (duracao > 0) {
                    b.setDurationMillis((int) Math.min(duracao, Integer.MAX_VALUE));
                    b.setLastPlaybackPositionMillis((int) Math.min(it.optLong("posicaoMs", 0), duracao));
                }
                Long existente = atuais.get(id);
                if (existente != null) {
                    cr.update(TvContractCompat.buildWatchNextProgramUri(existente), b.build().toContentValues(), null, null);
                } else {
                    cr.insert(TvContractCompat.WatchNextPrograms.CONTENT_URI, b.build().toContentValues());
                }
            }
            for (Map.Entry<String, Long> e : atuais.entrySet()) {
                if (!manter.contains(e.getKey())) cr.delete(TvContractCompat.buildWatchNextProgramUri(e.getValue()), null, null);
            }
            call.resolve();
        } catch (JSONException | RuntimeException e) {
            // TV sem o provedor da fileira (ou que recusa): o app segue igual, so sem a fileira.
            call.reject("fileira indisponivel: " + e.getMessage());
        }
    }

    /** Caminho pedido por um item da fileira com o app fechado; o site pergunta isto ao abrir e navega. */
    @PluginMethod
    public void pendente(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("path", pendente);
        pendente = null;
        call.resolve(ret);
    }
}
