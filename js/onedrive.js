// ============================================================
// ONEDRIVE.JS - Envío a OneDrive via Power Automate
// Sin login por usuario — un solo flujo configurado por el admin
// ============================================================
(function () {
    'use strict';

    function getUrl() {
        return localStorage.getItem('power-automate-url') || '';
    }

    // Convierte ArrayBuffer a base64
    function bufferToBase64(buffer) {
        var bytes = new Uint8Array(buffer);
        var binary = '';
        var chunk = 8192;
        for (var i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
    }

    // Sube un ArrayBuffer a OneDrive via Power Automate
    window.subirAOneDrive = async function (buffer, fileName) {
        var url = getUrl();
        if (!url) {
            if (window.showToast) showToast('⚙️ Configura la URL de Power Automate en Configuración → OneDrive', 'error');
            return false;
        }

        try {
            var base64 = bufferToBase64(buffer);

            var resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileName: fileName, fileContent: base64 })
            });

            // Power Automate devuelve 200 o 202 (aceptado)
            if (resp.ok || resp.status === 202) {
                if (window.showToast) showToast('✅ Enviado a Google Drive — carpeta: Visitas Técnicas Solar', 'success');
                actualizarEstadoUI(true);
                return true;
            }
            throw new Error('Respuesta HTTP ' + resp.status);
        } catch (e) {
            console.error('Power Automate upload error:', e);
            var msg = 'Error al enviar a OneDrive';
            if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
                msg = 'Sin conexión. El archivo se descargó localmente.';
            } else if (e.message) {
                msg = e.message;
            }
            if (window.showToast) showToast(msg, 'error');
            return false;
        }
    };

    window.estadoOneDrive = function () {
        return { configurado: !!getUrl() };
    };

    function actualizarEstadoUI(ok) {
        var el = document.getElementById('onedrive-status');
        if (!el) return;
        if (!getUrl()) {
            el.innerHTML = '⚠️ Sin configurar — sigue los pasos abajo para activarlo';
            el.style.color = '#F9A825';
        } else if (ok) {
            el.innerHTML = '✅ Conectado y funcionando — archivos en Google Drive';
            el.style.color = '#2E7D32';
        } else {
            el.innerHTML = '🔵 URL configurada — listo para subir a Google Drive';
            el.style.color = '#0078D4';
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        // Cargar URL guardada
        var inputUrl = document.getElementById('config-pa-url');
        if (inputUrl) inputUrl.value = getUrl();

        // Guardar URL
        var btnGuardar = document.getElementById('btn-guardar-onedrive');
        if (btnGuardar) {
            btnGuardar.addEventListener('click', function () {
                var url = (document.getElementById('config-pa-url').value || '').trim();
                localStorage.setItem('power-automate-url', url);
                actualizarEstadoUI(false);
                if (window.showToast) showToast(url ? '✅ URL guardada. OneDrive activo.' : 'URL eliminada', url ? 'success' : 'error');
            });
        }

        setTimeout(actualizarEstadoUI, 300);
    });
})();
