// offlineSync.js
let App; // La referencia al objeto App de tu script principal

const OFFLINE_STORAGE_KEY = 'offlinePendingData';

/**
 * Inicializa la lógica de sincronización offline.
 * Espera hasta que el objeto 'App' esté disponible en el ámbito global.
 */
function initializeOfflineSync() {
    // Si App aún no está definido, reintentar después de un breve retraso
    if (typeof window.App === 'undefined') {
        console.warn("Objeto 'App' no encontrado, reintentando inicialización de sincronización offline...");
        setTimeout(initializeOfflineSync, 100);
        return;
    }

    App = window.App; // Obtener la referencia al objeto App

    // ====================================================================
    // 1. Modificar el método de guardado principal de App
    // ====================================================================

    // Guardar una referencia a la función original que realiza el guardado en Firestore.
    // La función `saveData` de App ya está debounced. Necesitamos acceder a la lógica interna `_saveDataToFirestore`.
    const originalSaveToFirestoreLogic = App._saveDataToFirestore;

    // Sobrescribir la lógica interna de guardado para manejar el estado online/offline
    App._saveDataToFirestore = async function() {
        if (!App.state.currentUser || !App.state.isDataLoaded) {
            console.log("No hay usuario logueado o datos no cargados, saltando guardado.");
            return;
        }

        const dataToSave = {
            notes: App.state.notes,
            zones: App.state.zones,
            youtubeUrl: App.state.youtubeUrl
        };

        if (navigator.onLine) {
            // Si hay conexión, intentar guardar en Firestore
            console.log("Online: Intentando guardar en Firestore...");
            App.DOM.saveStatus.textContent = 'Guardando...';
            try {
                const userDocRef = App.firebase.db && App.state.currentUser ? App.firebase.db.doc('user_data', App.state.currentUser.uid) : null;
                if (userDocRef) {
                    await App.firebase.db.setDoc(userDocRef, dataToSave);
                    console.log("Guardado en Firestore exitoso.");
                    localStorage.removeItem(OFFLINE_STORAGE_KEY); // Limpiar datos pendientes si el guardado online fue exitoso
                    App.DOM.saveStatus.textContent = 'Guardado ✓';
                    setTimeout(() => App.DOM.saveStatus.textContent = '', 2000);
                } else {
                    throw new Error("Base de datos de Firebase o usuario actual no disponible.");
                }
            } catch (error) {
                console.error("Error al guardar en Firestore, guardando localmente como fallback:", error);
                // Si falla el guardado en Firestore (ej. problemas de permisos, etc.), guardar localmente
                localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(dataToSave));
                App.DOM.saveStatus.textContent = 'Error al guardar, guardado localmente';
                App.showAlertModal('Error de Guardado', 'Hubo un problema al guardar en la nube. Tus datos se han guardado localmente. Se intentará sincronizar al reconectar.');
            }
        } else {
            // Si no hay conexión, guardar en localStorage
            console.log("Offline: Guardando datos en localStorage.");
            localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(dataToSave));
            App.DOM.saveStatus.textContent = 'Guardado localmente (offline)';
        }
    };

    // ====================================================================
    // 2. Manejar eventos de conexión online/offline
    // ====================================================================

    // Listener para cuando se pierde la conexión
    window.addEventListener('offline', () => {
        console.warn('Conexión a internet perdida.');
        App.showAlertModal('¡Sin conexión!', 'Se ha perdido la conexión a internet. Los cambios se guardarán localmente y se sincronizarán al reconectar.');
        // No necesitamos forzar un App.saveData() aquí;
        // el próximo autoguardado o guardado manual ya utilizará la lógica offline.
    });

    // Listener para cuando se restaura la conexión
    window.addEventListener('online', () => {
        console.log('Conexión a internet restaurada.');
        App.showAlertModal('¡Conexión de vuelta!', 'La conexión a internet se ha restaurado. Tus cambios locales se están sincronizando con el servidor.');
        uploadPendingOfflineData();
    });

    // ====================================================================
    // 3. Subir datos pendientes del localStorage al servidor
    // ====================================================================

    /**
     * Intenta subir los datos guardados en localStorage a Firestore.
     */
    async function uploadPendingOfflineData() {
        const pendingDataJSON = localStorage.getItem(OFFLINE_STORAGE_KEY);
        if (pendingDataJSON) {
            const dataToUpload = JSON.parse(pendingDataJSON);
            if (App.state.currentUser && App.firebase.db) {
                console.log("Subiendo datos pendientes de localStorage a Firestore...");
                App.DOM.saveStatus.textContent = 'Sincronizando...';
                try {
                    const userDocRef = App.firebase.db.doc('user_data', App.state.currentUser.uid);
                    await App.firebase.db.setDoc(userDocRef, dataToUpload); // Usar setDoc para sobrescribir con los datos locales
                    console.log("Datos pendientes subidos exitosamente.");
                    localStorage.removeItem(OFFLINE_STORAGE_KEY); // Limpiar localStorage tras subida exitosa
                    App.DOM.saveStatus.textContent = 'Guardado ✓';
                    App.showAlertModal('Sincronización Completa', 'Todos tus cambios sin conexión han sido guardados en la nube.');
                    // Opcional: Recargar los datos del usuario para asegurar que la UI refleje el estado final
                    // App.loadData(); // Descomentar si es necesario, pero puede causar un parpadeo en la UI.
                                        // Idealmente, el App.state ya debería estar actualizado con los datos locales.
                } catch (error) {
                    console.error("Error al subir datos pendientes:", error);
                    App.DOM.saveStatus.textContent = 'Error de sincronización';
                    App.showAlertModal('Error de Sincronización', 'Hubo un problema al sincronizar tus cambios sin conexión. Los datos permanecen guardados localmente.');
                }
            } else {
                console.warn("Usuario no logueado o Firebase DB no disponible para subir datos pendientes.");
            }
        }
    }

    // ====================================================================
    // 4. Ejecutar la lógica al cargar la página
    // ====================================================================

    // Verificar el estado de la conexión al inicio de la aplicación
    if (navigator.onLine) {
        uploadPendingOfflineData(); // Intentar subir cualquier dato pendiente si estamos online al inicio
    }
}

// Asegurarse de que el DOM esté completamente cargado antes de inicializar
document.addEventListener('DOMContentLoaded', initializeOfflineSync);