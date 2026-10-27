package com.pedreiraflix.app;

import android.app.Activity;
import android.content.Intent;
import android.speech.RecognizerIntent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;

/**
 * Busca por voz no APK (celular e TV): a WebView do Android nao tem o reconhecimento de voz do Chrome, entao isto
 * abre o reconhecedor do proprio aparelho (o mesmo do botao de microfone do controle) e devolve o texto ao site
 * (src/lib/voz.ts). Nao pede permissao de microfone: quem grava e o app de voz do sistema.
 */
@CapacitorPlugin(name = "Voz")
public class VozPlugin extends Plugin {

    private Intent pedido() {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR");
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Fale o nome do filme, série ou canal");
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        return intent;
    }

    @PluginMethod
    public void disponivel(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("ok", pedido().resolveActivity(getContext().getPackageManager()) != null);
        call.resolve(ret);
    }

    @PluginMethod
    public void ouvir(PluginCall call) {
        try {
            startActivityForResult(call, pedido(), "resultado");
        } catch (Exception e) {
            call.reject("sem reconhecimento de voz");
        }
    }

    @ActivityCallback
    private void resultado(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        Intent data = result.getData();
        ArrayList<String> textos = result.getResultCode() == Activity.RESULT_OK && data != null
            ? data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
            : null;
        ret.put("texto", textos != null && !textos.isEmpty() ? textos.get(0) : null);
        call.resolve(ret);
    }
}
