import { Context } from "grammy";

export interface SessionData {
    step: 'idle' | 'waiting_photo' | 'waiting_name' | 'waiting_qr' | 'waiting_location' | 'waiting_qr_input' | 'waiting_confirmation';
    currentRegistration?: {
        photo?: string;
        name?: string;
        qr?: string;
        location?: {
            latitude: number;
            longitude: number;
        };
    };
    botMessageIds: number[];    // Para rastrear los mensajes del bot
    userMessageIds: number[];   // Para rastrear los mensajes del usuario
}

export interface MyContext extends Context {
    session: SessionData;
}

export const initialSession: SessionData = {
    step: 'idle',
    botMessageIds: [],
    userMessageIds: []
}; 