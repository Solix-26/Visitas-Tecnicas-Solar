// ============================================================
// AUTH.JS - Autenticación con Firebase + verificación Firestore
// ============================================================

(function () {
    'use strict';

    var auth, db;
    window.splashDone = false;
    window.authStateResolved = false;
    window.currentFirebaseUser = null;
    window.currentUserRole = null;

    document.addEventListener('DOMContentLoaded', initAuth);

    function initAuth() {
        try {
            firebase.initializeApp(firebaseConfig);
        } catch (e) {
            // Ya inicializado
        }

        auth = firebase.auth();
        db = firebase.firestore();
        window.db = db;
        window.auth = auth;

        auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

        auth.onAuthStateChanged(function (user) {
            if (user) {
                verificarPerfil(user);
            } else {
                window.currentFirebaseUser = null;
                window.currentUserRole = null;
                window.authStateResolved = true;
                if (window.splashDone) showLoginScreen();
            }
        });

        var loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', function (e) {
                e.preventDefault();
                handleLogin();
            });
        }

        var btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', function () {
                auth.signOut().then(function () {
                    showLoginScreen();
                });
            });
        }

        var btnForgot = document.getElementById('btn-forgot-password');
        if (btnForgot) {
            btnForgot.addEventListener('click', function (e) {
                e.preventDefault();
                var email = document.getElementById('login-email').value.trim();
                if (!email) {
                    showLoginError('Ingresa tu correo electrónico primero');
                    return;
                }
                auth.sendPasswordResetEmail(email)
                    .then(function () {
                        showLoginError('');
                        var errorEl = document.getElementById('login-error');
                        if (errorEl) {
                            errorEl.style.color = '#4CAF50';
                            errorEl.textContent = 'Correo de recuperación enviado. Revisa tu bandeja.';
                        }
                    })
                    .catch(function (error) {
                        var msg = 'No se pudo enviar el correo de recuperación';
                        if (error.code === 'auth/user-not-found') msg = 'No existe una cuenta con ese correo';
                        if (error.code === 'auth/invalid-email') msg = 'Correo electrónico inválido';
                        showLoginError(msg);
                    });
            });
        }
    }

    function verificarPerfil(user) {
        db.collection('users').doc(user.uid).get()
            .then(function (doc) {
                console.log('Perfil existe:', doc.exists, '| UID:', user.uid);
                if (!doc.exists) {
                    // Primer usuario del sistema → se convierte en admin
                    return db.collection('users').get().then(function (snap) {
                        console.log('Colección users vacía:', snap.empty);
                        var role = snap.empty ? 'admin' : null;
                        if (role === 'admin') {
                            return db.collection('users').doc(user.uid).set({
                                email: user.email,
                                nombre: user.email,
                                role: 'admin',
                                disabled: false,
                                createdAt: firebase.firestore.FieldValue.serverTimestamp()
                            }).then(function () {
                                resolverAcceso(user, 'admin');
                            });
                        } else {
                            // No tiene perfil y no es el primer usuario
                            auth.signOut();
                            showLoginScreen();
                            showLoginError('No tienes acceso a esta aplicación');
                        }
                    });
                }

                var data = doc.data();
                if (data.disabled) {
                    auth.signOut();
                    showLoginScreen();
                    showLoginError('Tu cuenta ha sido desactivada');
                    return;
                }

                resolverAcceso(user, data.role);
            })
            .catch(function () {
                auth.signOut();
                showLoginScreen();
                showLoginError('Error al verificar acceso. Intenta de nuevo');
            });
    }

    function resolverAcceso(user, role) {
        console.log('Rol resuelto:', role, '| splashDone:', window.splashDone);
        window.currentFirebaseUser = user;
        window.currentUserRole = role;
        window.authStateResolved = true;
        // Actualizar nav de admin en cuanto se conoce el rol
        actualizarNavAdmin(role);
        if (window.splashDone) {
            showApp(user, role);
        }
    }

    function actualizarNavAdmin(role) {
        var navAdmin = document.getElementById('nav-admin-usuarios');
        if (navAdmin) {
            navAdmin.style.display = role === 'admin' ? 'flex' : 'none';
        }
    }

    function handleLogin() {
        var email = document.getElementById('login-email').value.trim();
        var password = document.getElementById('login-password').value;
        var btnLogin = document.getElementById('btn-login-submit');

        if (!email || !password) {
            showLoginError('Completa todos los campos');
            return;
        }

        btnLogin.disabled = true;
        btnLogin.textContent = 'Ingresando...';
        document.getElementById('login-error').textContent = '';

        auth.signInWithEmailAndPassword(email, password)
            .catch(function (error) {
                btnLogin.disabled = false;
                btnLogin.textContent = 'Ingresar';
                var msg = 'Error al iniciar sesión';
                if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                    msg = 'Correo o contraseña incorrectos';
                } else if (error.code === 'auth/too-many-requests') {
                    msg = 'Demasiados intentos fallidos. Espera unos minutos';
                } else if (error.code === 'auth/network-request-failed') {
                    msg = 'Sin conexión a internet';
                } else if (error.code === 'auth/user-disabled') {
                    msg = 'Esta cuenta ha sido desactivada';
                }
                showLoginError(msg);
            });
    }

    function showApp(user, role) {
        var btn = document.getElementById('btn-login-submit');
        if (btn) { btn.disabled = false; btn.textContent = 'Ingresar'; }

        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-header').style.display = 'flex';

        var emailEl = document.getElementById('sidebar-user-email');
        if (emailEl && user.email) emailEl.textContent = user.email;

        actualizarNavAdmin(role || window.currentUserRole);
    }

    function showLoginScreen() {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('app-header').style.display = 'none';
        var form = document.getElementById('login-form');
        if (form) form.reset();
        document.getElementById('login-error').textContent = '';
    }

    function showLoginError(msg) {
        var errorEl = document.getElementById('login-error');
        if (errorEl) errorEl.textContent = msg;
    }

    window.onSplashComplete = function () {
        window.splashDone = true;
        if (window.authStateResolved) {
            if (window.currentFirebaseUser) {
                showApp(window.currentFirebaseUser, window.currentUserRole);
            } else {
                showLoginScreen();
            }
        }
    };
})();
