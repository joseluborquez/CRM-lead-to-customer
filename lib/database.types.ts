// Generado desde el esquema de Supabase. NO editar a mano.
// Regenerar con:  npx supabase gen types typescript --project-id aiosuhcdtpvzcarbkbtv

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.4'
  }
  public: {
    Tables: {
      pipeline: {
        Row: {
          alcance_agente: string | null
          calificacion_completa: boolean
          canal_adquisicion: string | null
          comentario_problematica: string | null
          email: string | null
          especificidad_dolor: string | null
          estado: string | null
          estado_reunion: string | null
          evento_calendar_id: string | null
          fecha_captura: string | null
          fecha_cierre: string | null
          fecha_reunion: string | null
          fuente: string | null
          id: string
          industria_empresa: string | null
          kapso_conversation_id: string | null
          kapso_phone_number_id: string | null
          lead_id: string | null
          link_pagina_web: string | null
          link_reunion: string | null
          monto_cerrado: number | null
          moneda: string
          nombre_empresa: string | null
          nombre_lead: string
          origen: string
          presupuesto_asignado: string | null
          proximo_seguimiento: string | null
          puntuacion_lead: number | null
          research_insight: string | null
          rol_lead: string | null
          senales_conversacion: Json
          sistemas_a_integrar: string | null
          telefono_e164: string | null
          tipo_lead: string | null
          updated_at: string
          urgencia: string | null
          volumen_conversaciones: string | null
          whatsapp: string | null
        }
        Insert: {
          alcance_agente?: string | null
          calificacion_completa?: boolean
          canal_adquisicion?: string | null
          comentario_problematica?: string | null
          email?: string | null
          especificidad_dolor?: string | null
          estado?: string | null
          estado_reunion?: string | null
          evento_calendar_id?: string | null
          fecha_captura?: string | null
          fecha_cierre?: string | null
          fecha_reunion?: string | null
          fuente?: string | null
          id?: string
          industria_empresa?: string | null
          kapso_conversation_id?: string | null
          kapso_phone_number_id?: string | null
          lead_id?: string | null
          link_pagina_web?: string | null
          link_reunion?: string | null
          monto_cerrado?: number | null
          moneda?: string
          nombre_empresa?: string | null
          nombre_lead: string
          origen?: string
          presupuesto_asignado?: string | null
          proximo_seguimiento?: string | null
          puntuacion_lead?: number | null
          research_insight?: string | null
          rol_lead?: string | null
          senales_conversacion?: Json
          sistemas_a_integrar?: string | null
          telefono_e164?: string | null
          tipo_lead?: string | null
          updated_at?: string
          urgencia?: string | null
          volumen_conversaciones?: string | null
          whatsapp?: string | null
        }
        Update: {
          alcance_agente?: string | null
          calificacion_completa?: boolean
          canal_adquisicion?: string | null
          comentario_problematica?: string | null
          email?: string | null
          especificidad_dolor?: string | null
          estado?: string | null
          estado_reunion?: string | null
          evento_calendar_id?: string | null
          fecha_captura?: string | null
          fecha_cierre?: string | null
          fecha_reunion?: string | null
          fuente?: string | null
          id?: string
          industria_empresa?: string | null
          kapso_conversation_id?: string | null
          kapso_phone_number_id?: string | null
          lead_id?: string | null
          link_pagina_web?: string | null
          link_reunion?: string | null
          monto_cerrado?: number | null
          moneda?: string
          nombre_empresa?: string | null
          nombre_lead?: string
          origen?: string
          presupuesto_asignado?: string | null
          proximo_seguimiento?: string | null
          puntuacion_lead?: number | null
          research_insight?: string | null
          rol_lead?: string | null
          senales_conversacion?: Json
          sistemas_a_integrar?: string | null
          telefono_e164?: string | null
          tipo_lead?: string | null
          updated_at?: string
          urgencia?: string | null
          volumen_conversaciones?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      conversaciones: {
        Row: {
          contenido: string
          creado_en: string
          enviado_en: string
          id: string
          kapso_conversation_id: string | null
          kapso_message_id: string | null
          lead_id: string | null
          rol: string
          telefono_e164: string
          tipo_mensaje: string
        }
        Insert: {
          contenido?: string
          creado_en?: string
          enviado_en?: string
          id?: string
          kapso_conversation_id?: string | null
          kapso_message_id?: string | null
          lead_id?: string | null
          rol: string
          telefono_e164: string
          tipo_mensaje?: string
        }
        Update: {
          contenido?: string
          creado_en?: string
          enviado_en?: string
          id?: string
          kapso_conversation_id?: string | null
          kapso_message_id?: string | null
          lead_id?: string | null
          rol?: string
          telefono_e164?: string
          tipo_mensaje?: string
        }
        Relationships: [
          {
            foreignKeyName: 'conversaciones_lead_id_fkey'
            columns: ['lead_id']
            isOneToOne: false
            referencedRelation: 'pipeline'
            referencedColumns: ['id']
          },
        ]
      }
      reuniones: {
        Row: {
          creada_por: string
          creado_en: string
          estado: string
          evento_calendar_id: string | null
          fecha_fin: string
          fecha_inicio: string
          id: string
          lead_id: string
          link_reunion: string | null
          motivo: string | null
          notas: string | null
          reemplaza_a: string | null
          updated_at: string
        }
        Insert: {
          creada_por?: string
          creado_en?: string
          estado?: string
          evento_calendar_id?: string | null
          fecha_fin: string
          fecha_inicio: string
          id?: string
          lead_id: string
          link_reunion?: string | null
          motivo?: string | null
          notas?: string | null
          reemplaza_a?: string | null
          updated_at?: string
        }
        Update: {
          creada_por?: string
          creado_en?: string
          estado?: string
          evento_calendar_id?: string | null
          fecha_fin?: string
          fecha_inicio?: string
          id?: string
          lead_id?: string
          link_reunion?: string | null
          motivo?: string | null
          notas?: string | null
          reemplaza_a?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'reuniones_lead_id_fkey'
            columns: ['lead_id']
            isOneToOne: false
            referencedRelation: 'pipeline'
            referencedColumns: ['id']
          },
        ]
      }
      telefonos_bloqueados: {
        Row: {
          bloqueado_en: string
          bloqueado_por: string
          motivo: string | null
          telefono_e164: string
        }
        Insert: {
          bloqueado_en?: string
          bloqueado_por?: string
          motivo?: string | null
          telefono_e164: string
        }
        Update: {
          bloqueado_en?: string
          bloqueado_por?: string
          motivo?: string | null
          telefono_e164?: string
        }
        Relationships: []
      }
      historial_estado: {
        Row: {
          actor: string
          cambiado_en: string
          estado_anterior: string | null
          estado_nuevo: string
          id: string
          lead_id: string
          nota: string | null
        }
        Insert: {
          actor?: string
          cambiado_en?: string
          estado_anterior?: string | null
          estado_nuevo: string
          id?: string
          lead_id: string
          nota?: string | null
        }
        Update: {
          actor?: string
          cambiado_en?: string
          estado_anterior?: string | null
          estado_nuevo?: string
          id?: string
          lead_id?: string
          nota?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'historial_estado_lead_id_fkey'
            columns: ['lead_id']
            isOneToOne: false
            referencedRelation: 'pipeline'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calcular_puntuacion_lead: {
        Args: {
          p_alcance: string
          p_dolor: string
          p_rol: string
          p_sistemas: string
          p_urgencia: string
          p_volumen: string
        }
        Returns: number
      }
      clasificar_tipo_lead: { Args: { p_score: number }; Returns: string }
      normalizar_telefono: { Args: { t: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database['public']

export type Tables<T extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][T]['Row']

export type TablesInsert<T extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][T]['Update']
