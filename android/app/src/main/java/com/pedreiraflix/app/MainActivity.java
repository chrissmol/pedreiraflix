package com.pedreiraflix.app;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin proprio do app (download em segundo plano); precisa ser registrado antes do super.onCreate.
        registerPlugin(BaixadorPlugin.class);
        super.onCreate(savedInstanceState);

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
}
