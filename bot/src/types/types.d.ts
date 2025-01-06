// Estados posibles del proceso de registro
export type RegistrationStep = 
    | 'idle'              // Estado inicial/sin proceso activo
    | 'waiting_photo'     // Esperando foto de la inmobiliaria
    | 'waiting_name'      // Esperando nombre (manual o confirmación de AI)
    | 'waiting_qr'        // Esperando decisión sobre QR (tiene/no tiene)
    | 'waiting_qr_input'  // Esperando input del QR
    | 'waiting_location'  // Esperando ubicación GPS
    | 'waiting_confirmation'; // Esperando confirmación final

// Datos de una inmobiliaria en proceso de registro
export interface RealEstateRegistration {
    // Datos principales
    photo?: string;           // ID de la foto en Telegram
    photo_url?: string;       // URL de la foto en Supabase
    name?: string;            // Nombre de la inmobiliaria
    qr?: string;             // Información del QR (o "No tiene QR")
    location?: {
        latitude: number;
        longitude: number;
    };

    // Metadatos del proceso
    started_at: number;       // Timestamp de inicio del proceso
    last_update: number;      // Último timestamp de actualización
    messages_ids: number[];   // IDs de mensajes relacionados con este proceso
}

// Estado del proceso de registro
export interface RegistrationState {
    step: RegistrationStep;
    currentRegistration?: RealEstateRegistration;
    is_active: boolean;       // Indica si hay un proceso activo
}

// Errores posibles durante el proceso
export type RegistrationError = 
    | 'TIMEOUT'              // Proceso expirado por tiempo
    | 'INVALID_STEP'         // Intento de acción en paso incorrecto
    | 'MISSING_DATA'         // Datos faltantes
    | 'UPLOAD_ERROR'         // Error al subir foto
    | 'API_ERROR'            // Error en APIs externas
    | 'CANCELLED';           // Proceso cancelado por usuario 