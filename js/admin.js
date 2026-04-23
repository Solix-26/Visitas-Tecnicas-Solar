// ============================================================
// ADMIN.JS - Panel de gestión de usuarios
// ============================================================

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        // Esperar a que el sidebar esté listo
        var navAdmin = document.getElementById('nav-admin-usuarios');
        if (navAdmin) {
            navAdmin.addEventListener('click', function (e) {
                e.preventDefault();
                cargarUsuarios();
            });
        }

        var btnAgregar = document.getElementById('btn-admin-agregar');
        if (btnAgregar) {
            btnAgregar.addEventListener('click', agregarUsuario);
        }
    });

    // ── Cargar lista de usuarios ──────────────────────────────
    function cargarUsuarios() {
        var lista = document.getElementById('admin-users-list');
        if (!lista) return;
        lista.innerHTML = '<p class="hint">Cargando...</p>';

        window.db.collection('users').orderBy('createdAt').get()
            .then(function (snap) {
                if (snap.empty) {
                    lista.innerHTML = '<p class="hint">No hay usuarios registrados.</p>';
                    return;
                }
                lista.innerHTML = '';
                snap.forEach(function (doc) {
                    lista.appendChild(crearTarjetaUsuario(doc.id, doc.data()));
                });
            })
            .catch(function () {
                lista.innerHTML = '<p class="hint" style="color:var(--danger)">Error al cargar usuarios.</p>';
            });
    }

    // ── Crear tarjeta de usuario ──────────────────────────────
    function crearTarjetaUsuario(uid, data) {
        var esMismoUsuario = window.currentFirebaseUser && window.currentFirebaseUser.uid === uid;

        var card = document.createElement('div');
        card.className = 'admin-user-card' + (data.disabled ? ' disabled' : '');
        card.id = 'user-card-' + uid;

        var badge = data.role === 'admin' ? '<span class="badge-admin">Admin</span>' : '<span class="badge-tecnico">Técnico</span>';
        var estadoBadge = data.disabled ? '<span class="badge-disabled">Desactivado</span>' : '<span class="badge-active">Activo</span>';

        card.innerHTML =
            '<div class="admin-user-info">' +
                '<p class="admin-user-nombre">' + (data.nombre || data.email) + '</p>' +
                '<p class="admin-user-email">' + data.email + '</p>' +
                '<div class="admin-user-badges">' + badge + estadoBadge + '</div>' +
            '</div>' +
            '<div class="admin-user-actions">' +
                (!esMismoUsuario ? (
                    '<button class="btn-admin-action ' + (data.disabled ? 'btn-enable' : 'btn-disable') + '" data-uid="' + uid + '" data-disabled="' + data.disabled + '">' +
                        (data.disabled ? 'Activar' : 'Desactivar') +
                    '</button>' +
                    '<button class="btn-admin-action btn-delete" data-uid="' + uid + '" data-email="' + data.email + '">Eliminar</button>'
                ) : '<span class="hint">(tu cuenta)</span>') +
            '</div>';

        // Eventos de botones
        var btnToggle = card.querySelector('.btn-disable, .btn-enable');
        if (btnToggle) {
            btnToggle.addEventListener('click', function () {
                toggleUsuario(uid, data.disabled);
            });
        }

        var btnDel = card.querySelector('.btn-delete');
        if (btnDel) {
            btnDel.addEventListener('click', function () {
                eliminarUsuario(uid, data.email);
            });
        }

        return card;
    }

    // ── Agregar nuevo usuario ─────────────────────────────────
    function agregarUsuario() {
        var nombre = document.getElementById('admin-nuevo-nombre').value.trim();
        var email = document.getElementById('admin-nuevo-email').value.trim();
        var password = document.getElementById('admin-nuevo-password').value;
        var errorEl = document.getElementById('admin-form-error');
        var btn = document.getElementById('btn-admin-agregar');

        errorEl.textContent = '';

        if (!nombre || !email || !password) {
            errorEl.textContent = 'Completa todos los campos';
            return;
        }
        if (password.length < 6) {
            errorEl.textContent = 'La contraseña debe tener mínimo 6 caracteres';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Creando...';

        // Usar una app secundaria para no cerrar sesión del admin
        var appSecundaria;
        try {
            appSecundaria = firebase.initializeApp(firebaseConfig, 'admin-crear-' + Date.now());
        } catch (e) {
            appSecundaria = firebase.app('admin-crear-' + Date.now());
        }

        appSecundaria.auth().createUserWithEmailAndPassword(email, password)
            .then(function (cred) {
                var nuevoUid = cred.user.uid;
                return window.db.collection('users').doc(nuevoUid).set({
                    email: email,
                    nombre: nombre,
                    role: 'technician',
                    disabled: false,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: window.currentFirebaseUser ? window.currentFirebaseUser.uid : ''
                }).then(function () {
                    return appSecundaria.auth().signOut();
                }).then(function () {
                    return appSecundaria.delete();
                });
            })
            .then(function () {
                btn.disabled = false;
                btn.textContent = '➕ Agregar usuario';
                document.getElementById('admin-nuevo-nombre').value = '';
                document.getElementById('admin-nuevo-email').value = '';
                document.getElementById('admin-nuevo-password').value = '';
                mostrarToast('Usuario creado correctamente', 'success');
                cargarUsuarios();
            })
            .catch(function (error) {
                btn.disabled = false;
                btn.textContent = '➕ Agregar usuario';
                var msg = 'Error al crear usuario';
                if (error.code === 'auth/email-already-in-use') msg = 'Ese correo ya está registrado';
                if (error.code === 'auth/invalid-email') msg = 'Correo no válido';
                if (error.code === 'auth/weak-password') msg = 'Contraseña muy débil';
                errorEl.textContent = msg;
                if (appSecundaria) appSecundaria.delete().catch(function(){});
            });
    }

    // ── Activar / Desactivar usuario ──────────────────────────
    function toggleUsuario(uid, estabaDesactivado) {
        var nuevoEstado = !estabaDesactivado;
        window.db.collection('users').doc(uid).update({ disabled: nuevoEstado })
            .then(function () {
                mostrarToast(nuevoEstado ? 'Usuario desactivado' : 'Usuario activado', 'success');
                cargarUsuarios();
            })
            .catch(function () {
                mostrarToast('Error al cambiar estado', 'error');
            });
    }

    // ── Eliminar usuario ──────────────────────────────────────
    function eliminarUsuario(uid, email) {
        if (!confirm('¿Eliminar a ' + email + '? Esta acción no se puede deshacer.')) return;
        window.db.collection('users').doc(uid).delete()
            .then(function () {
                mostrarToast('Usuario eliminado', 'success');
                cargarUsuarios();
            })
            .catch(function () {
                mostrarToast('Error al eliminar usuario', 'error');
            });
    }

    // ── Toast ─────────────────────────────────────────────────
    function mostrarToast(msg, tipo) {
        var toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = msg;
        toast.className = 'toast show ' + (tipo || '');
        setTimeout(function () { toast.className = 'toast'; }, 3000);
    }

    // Exponer para que app.js pueda llamar a cargarUsuarios al navegar
    window.adminCargarUsuarios = cargarUsuarios;
})();
