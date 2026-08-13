import { START, Workflow } from '@kapso/workflows';

const workflow = new Workflow("restaurante", {
  name: "RESTAURANTE",
  status: "draft",
});

workflow.addNode(START, {
  "position": {
    "x": 100,
    "y": 100
  }
});

workflow.addTrigger({
  "active": true,
  "type": "inbound_message",
  "phoneNumberId": "597907523413541"
});

workflow.addNode("send_text_1782160139705", {
  "config": {
    "whatsapp_config_id": "815ae4d5-c288-4e6e-8e50-6ab3237116a8",
    "phone_number_id": "597907523413541",
    "message": {
      "$ai": {}
    },
    "delay_seconds": 0,
    "provider_model_id": "8c6d57df-3f07-4290-b8a5-38047608c4df",
    "provider_model_name": "claude-haiku-4-5",
    "ai_field_config": {
      "message": {
        "mode": "prompt",
        "prompt": ""
      }
    },
    "to_phone_number": null
  },
  "nodeType": "send_text",
  "type": "raw"
}, {
  "position": {
    "x": 660,
    "y": 320
  },
  "displayName": "Send Text Message"
});

workflow.addNode("agent_1782159548032", {
  "config": {
    "system_prompt": "\"Eres el asistente de reservas y pedidos de La Nona por WhatsApp. Saluda, responde preguntas del menú usando la herramienta consultar_menu, y crea reservas con la herramienta crear_reserva confirmando siempre fecha, hora y número de personas antes de guardar. Sé breve y cálido.\"",
    "provider_model_id": "8c6d57df-3f07-4290-b8a5-38047608c4df",
    "provider_model_name": "claude-haiku-4-5",
    "temperature": "0.0",
    "max_iterations": 5,
    "max_tokens": 500,
    "reasoning_effort": null,
    "prompt_cache_ttl": "5m",
    "observer_prompt_mode": "analysis_only",
    "message_delivery_mode": "auto_send_assistant_text",
    "enabled_default_tools": [
      "send_notification_to_user",
      "send_media",
      "get_execution_metadata",
      "get_whatsapp_context",
      "contact_conversations",
      "get_current_datetime",
      "save_variable",
      "get_variable",
      "ask_about_file",
      "enter_waiting",
      "complete_task",
      "handoff_to_human"
    ],
    "default_tool_configs": {},
    "sandbox_enabled": false,
    "sandbox_network_mode": "allow_all",
    "sandbox_allowed_outbound_hosts": [],
    "flow_agent_function_tools": [
      {
        "name": "consultar_menu",
        "description": "Consulta los platos disponibles del menú del restaurante.",
        "function_id": null,
        "function_name": null,
        "input_schema": {
          "type": "object",
          "required": [
            "action"
          ],
          "properties": {
            "action": {
              "type": "string",
              "const": "consultar_menu"
            }
          }
        }
      },
      {
        "name": "crear_reserva",
        "description": "Crea una reserva de mesa en el restaurant. Usar solo después de confirmar con el cliente fecha, hora y número de personas.",
        "function_id": null,
        "function_name": null,
        "input_schema": {
          "type": "object",
          "required": [
            "action",
            "nombre",
            "telefono",
            "fecha",
            "hora",
            "personas"
          ],
          "properties": {
            "hora": {
              "type": "string",
              "description": "Hora de la reserva en formato HH:MM (24h)"
            },
            "fecha": {
              "type": "string",
              "description": "Fecha de la reserva en formato YYYY-MM-DD"
            },
            "action": {
              "type": "string",
              "const": "crear_reserva"
            },
            "nombre": {
              "type": "string",
              "description": "Nombre completo del cliente"
            },
            "personas": {
              "type": "integer",
              "description": "Número de comensales"
            },
            "telefono": {
              "type": "string",
              "description": "Número de WhatsApp del cliente, con código de país"
            },
            "comentario": {
              "type": "string",
              "description": "Notas opcionales: alergias, ocasión especial, mesa preferida, etc."
            }
          }
        }
      }
    ],
    "flow_agent_app_integration_tools": [],
    "flow_agent_webhooks": [],
    "flow_agent_knowledge_bases": [],
    "flow_agent_mcp_servers": [],
    "flow_agent_resources": []
  },
  "nodeType": "agent",
  "type": "raw"
}, {
  "position": {
    "x": 460,
    "y": 100
  },
  "displayName": "AI Agent"
});

workflow.addEdge(START, "agent_1782159548032");

workflow.addEdge("agent_1782159548032", "send_text_1782160139705");

export default workflow;
