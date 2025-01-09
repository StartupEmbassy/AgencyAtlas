import { Context } from "grammy";
import { Location } from "@grammyjs/types";
import { PhotoRegistration } from "./types";

// Posibles estados del registro
export type RegistrationStep = 
    | 'idle'                    // Estado inicial o cuando no hay registro en proceso
    | 'collecting_photos'       // Recibiendo fotos
    | 'analyzing_photos'        // Analizando fotos con IA
    | 'waiting_name'           // Esperando nombre
    | 'waiting_confirmation'    // Esperando confirmación inicial de datos
    | 'waiting_location'        // Esperando ubicación GPS
    | 'waiting_final_confirm'   // Esperando confirmación final con todos los datos
    ;

// Información de contacto
export interface ContactInfo {
    phone_numbers?: string[];
    emails?: string[];
    business_hours?: string;
}

// Registro actual
export interface RealEstateRegistration {
    photos: PhotoRegistration[];
    name?: string;
    web_url?: string;
    qr?: string;
    location?: Location;
    contact_info?: ContactInfo;
    messages_ids?: number[];  // IDs de los mensajes asociados a este registro
}

// Estado del registro
export interface RegistrationState {
    step: RegistrationStep;
    currentRegistration?: RealEstateRegistration;
    summary?: string;
}

// Datos de la sesión
export interface SessionData {
    registration: RegistrationState;
    botMessageIds: number[];
    userMessageIds: number[];
}

// Contexto personalizado
export interface MyContext extends Context {
    session: SessionData;
}

// Estado inicial de la sesión
export const initialSession: SessionData = {
    registration: {
        step: 'idle',
    },
    botMessageIds: [],
    userMessageIds: []
}; 