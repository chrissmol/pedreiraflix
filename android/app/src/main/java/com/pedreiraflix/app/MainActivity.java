package com.pedreiraflix.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin proprio do app (download em segundo plano); precisa ser registrado antes do super.onCreate.
        registerPlugin(BaixadorPlugin.class);
        registerPlugin(ContinuarTvPlugin.class);
        super.onCreate(savedInstanceState);
        // Aberto por um item da fileira "Continuar assistindo" da TV: o site ainda nao carregou, entao guarda o
        // caminho e o site pede ao plugin quando abrir (src/lib/continuarTv.ts).
        ContinuarTvPlugin.pendente = caminho(getIntent());

        // Botao "voltar" do Android (celular e controle do Fire TV): volta uma tela no app; so sai quando nao ha
        // mais para onde voltar. Sem isto ele fechava o app de qualquer tela (achado em 08/10).
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = getBridge() != null ? getBridge().getWebView() : null;
                if (web != null && web.canGoBack()) {
                    web.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });
    }

    // App ja aberto (singleTask): o item da fileira chega aqui e o site navega na hora.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String path = caminho(intent);
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        if (path != null && web != null) web.evaluateJavascript("location.assign(" + org.json.JSONObject.quote(path) + ")", null);
    }

    /** So caminhos do proprio site ("/watch/..."); qualquer outra coisa e ignorada. */
    static String caminho(Intent intent) {
        Uri data = intent != null ? intent.getData() : null;
        if (data == null || !"pedreiraflix".equals(data.getScheme()) || !"abrir".equals(data.getHost())) return null;
        String path = data.getQueryParameter("path");
        return path != null && path.startsWith("/") && !path.startsWith("//") ? path : null;
    }
}
