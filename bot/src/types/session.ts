import { Context } from "grammy";
import { RegistrationState } from "./types";

export interface SessionData {
    // Estado del proceso de registro
    registration: RegistrationState;
    
    // IDs de mensajes para tracking
    botMessageIds: number[];    // Mensajes enviados por el bot
    userMessageIds: number[];   // Mensajes enviados por el usuario
}

export interface MyContext extends Context {
    session: SessionData;
}

export const initialSession: SessionData = {
    registration: {
        step: 'idle',
        is_active: false
    },
    botMessageIds: [],
    userMessageIds: []
}; 