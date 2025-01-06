import { Context } from "grammy";
import { RealEstateRegistration } from "./types";

export interface SessionData {
    registration: {
        step: 'idle' | 'collecting_photos' | 'waiting_name' | 'waiting_qr' | 'waiting_qr_input' | 'waiting_location';
        currentRegistration?: RealEstateRegistration;
    };
    botMessageIds: number[];
    userMessageIds: number[];
}

export const initialSession: SessionData = {
    registration: {
        step: 'idle'
    },
    botMessageIds: [],
    userMessageIds: []
};

export type MyContext = Context & {
    session: SessionData;
}; 