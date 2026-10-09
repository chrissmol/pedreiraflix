package com.pedreiraflix.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin proprio do app (download em segundo plano); precisa ser registrado antes do super.onCreate.
        registerPlugin(BaixadorPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
