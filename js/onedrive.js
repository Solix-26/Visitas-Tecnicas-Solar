// ============================================================
// ONEDRIVE.JS - Integración con OneDrive via Microsoft Graph
// ============================================================
(function () {
    'use strict';

    var msalApp = null;
    var currentAccount = null;
    var FOLDER = 'Visitas Técnicas Solar';
    var SCOPES = ['Files.ReadWrite', 'User.Read'];

    function getClientId() {
        return localStorage.getItem('onedrive-client-id') || '';
    }

    function initMsal() {
        if (msalApp) return msalApp;
        var clientId = getClientId();
        if (!clientId) return null;

        try {
            var config = {
                auth: {
                    clientId: clientId,
                    authority: 'https://login.microsoftonline.com/common',
                    redirectUri: window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/')
                },
                cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false }
            };
            msalApp = new msal.PublicClientApplication(config);
            var accounts = msalApp.getAllAccounts();
            if (accounts.length > 0) currentAccount = accounts[0];
        } catch (e) {
            console.error('MSAL init error:', e);
            msalApp = null;
        }
        return msalApp;
    }

    async function getToken() {
        var inst = initMsal();
        if (!inst) throw new Error('OneDrive no configurado. Ingresa el Client ID en Configuración.');
        var req = { scopes: SCOPES };
        try {
            if (currentAccount) {
                var silent = await inst.acquireTokenSilent({ ...req, account: currentAccount });
                return silent.accessToken;
            }
        } catch (e) { /* popup fallback */ }
        var resp = await inst.loginPopup(req);
        currentAccount = resp.account;
        return resp.accessToken;
    }

    // Sube un ArrayBuffer a OneDrive
    window.subirAOneDrive = async function (buffer, fileName) {
        if (!getClientId()) {
            if (window.showToast) showToast('⚙️ Configura el Client ID de OneDrive en Configuración → OneDrive', 'error');
            return false;
        }
        try {
            var token = await getToken();
            var uploadUrl = 'https://graph.microsoft.com/v1.0/me/drive/root:/' +
                encodeURIComponent(FOLDER) + '/' + encodeURIComponent(fileName) + ':/content';

            var res = await fetch(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                },
                body: buffer
            });

            if (!res.ok) {
                var err = await res.json().catch(() => ({}));
                throw new Error(err.error?.message || 'Error HTTP ' + res.status);
            }

            var info = await res.json();
            if (window.showToast) showToast('✅ Guardado en OneDrive — carpeta: ' + FOLDER, 'success');
            // Actualizar estado en UI
            actualizarEstadoUI();
            return info;
        } catch (e) {
            console.error('OneDrive upload error:', e);
            var msg = 'Error al subir a OneDrive';
            if (e.message?.includes('popup') || e.message?.includes('Popup')) {
                msg = 'Ventana de Microsoft bloqueada. Permite ventanas emergentes para este sitio.';
            } else if (e.message) {
                msg = e.message;
            }
            if (window.showToast) showToast(msg, 'error');
            return false;
        }
    };

    // Cierra sesión de Microsoft
    window.cerrarSesionOneDrive = function () {
        if (!msalApp || !currentAccount) return;
        msalApp.logoutPopup({ account: currentAccount }).then(function () {
            currentAccount = null;
            actualizarEstadoUI();
        }).catch(function () {});
    };

    window.estadoOneDrive = function () {
        return {
            configurado: !!getClientId(),
            cuenta: currentAccount?.username || null
        };
    };

    function actualizarEstadoUI() {
        var el = document.getElementById('onedrive-status');
        if (!el) return;
        var estado = window.estadoOneDrive();
        if (!estado.configurado) {
            el.textContent = '⚠️ Sin configurar — ingresa el Client ID abajo';
            el.style.color = '#F9A825';
        } else if (estado.cuenta) {
            el.textContent = '✅ Conectado como: ' + estado.cuenta;
            el.style.color = '#2E7D32';
        } else {
            el.textContent = '🔵 Configurado — iniciar sesión al subir archivos';
            el.style.color = '#0078D4';
        }
    }

    // Init al cargar
    document.addEventListener('DOMContentLoaded', function () {
        initMsal();
        setTimeout(actualizarEstadoUI, 500);

        // Guardar Client ID
        var btnGuardar = document.getElementById('btn-guardar-onedrive');
        if (btnGuardar) {
            btnGuardar.addEventListener('click', function () {
                var id = document.getElementById('config-onedrive-client-id').value.trim();
                localStorage.setItem('onedrive-client-id', id);
                msalApp = null; // reinit on next use
                initMsal();
                actualizarEstadoUI();
                if (window.showToast) showToast('Client ID de OneDrive guardado', 'success');
            });
        }

        // Cargar Client ID guardado
        var inputId = document.getElementById('config-onedrive-client-id');
        if (inputId) inputId.value = getClientId();
    });
})();
