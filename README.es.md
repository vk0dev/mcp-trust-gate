# @vk0/mcp-trust-gate

Puerta de confianza previa a la instalación para servidores MCP — veredicto determinista GO/REVIEW/BLOCK con evidencia, antes de instalar nada.

[![npm](https://img.shields.io/npm/v/@vk0/mcp-trust-gate)](https://www.npmjs.com/package/@vk0/mcp-trust-gate)
[![license](https://img.shields.io/npm/l/@vk0/mcp-trust-gate)](./LICENSE)

[English](./README.md) | [Русский](./README.ru.md) | [日本語](./README.ja.md) | [简体中文](./README.zh-CN.md)

## Por qué

Los servidores MCP obtienen acceso real: tu sistema de archivos, tu navegador, tus credenciales, tu infraestructura. `npm install` no te dice qué puede *hacer* un servidor cuando un agente empieza a llamar a sus herramientas — el texto de marketing del README normalmente tampoco. Necesitas esa respuesta **antes** de que el servidor se ejecute, no después de que algo salga mal.

Úsalo cuando el usuario pregunte:
- «¿Es seguro instalar este servidor MCP?»
- «¿A qué puede acceder realmente `@some/mcp-package`?»
- «Audita los servidores MCP de mi `.mcp.json` antes de empezar una sesión nueva.»
- «¿Debería aprobar esta configuración MCP que añadió un compañero o un agente?»
- «¿Ha cambiado el comportamiento de este servidor MCP desde la última vez que lo aprobé?»

`mcp-trust-gate` responde con un veredicto determinista — `GO`, `REVIEW` o `BLOCK` — respaldado por evidencia, no por sensaciones.

## Instalación

### Claude Code
```bash
claude mcp add mcp-trust-gate -- npx -y @vk0/mcp-trust-gate
```

### Claude Desktop
Añade a `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "mcp-trust-gate": {
      "command": "npx",
      "args": ["-y", "@vk0/mcp-trust-gate"]
    }
  }
}
```

### Cursor
Añade a `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "mcp-trust-gate": {
      "command": "npx",
      "args": ["-y", "@vk0/mcp-trust-gate"]
    }
  }
}
```

### Windsurf
Añade a `~/.codeium/windsurf/mcp_config.json`:
```json
{
  "mcpServers": {
    "mcp-trust-gate": {
      "command": "npx",
      "args": ["-y", "@vk0/mcp-trust-gate"]
    }
  }
}
```

### CLI (independiente, sin cliente MCP)
```bash
npx @vk0/mcp-trust-gate @playwright/mcp --card
```

## Herramientas

### `evaluate_install_gate`
**Entrada:** `package_name` (string) — el nombre del paquete npm del servidor MCP a evaluar, p. ej. `@playwright/mcp` o `mcp-remote`.
**Salida:** veredicto (`GO`/`REVIEW`/`BLOCK`), resumen, 9 comprobaciones individuales con evidencia, acciones recomendadas y una huella (fingerprint) de la postura de confianza actual con detección de deriva respecto a la última evaluación.
**Cuándo usarla:** antes de instalar o habilitar cualquier servidor MCP basado en npm.

### `scan_config`
**Entrada:** `config_path` (string) — ruta a un archivo `.mcp.json` o `claude_desktop_config.json`.
**Salida:** un resumen por lotes con veredicto por servidor y totales (`go`/`review`/`block`/`skipped`).
**Cuándo usarla:** para auditar todos los servidores MCP ya configurados en un cliente, p. ej. antes de una sesión nueva o al revisar la configuración de un compañero.

## Ejemplo de conversación

> **Usuario:** ¿Es seguro instalar `@playwright/mcp`?
>
> **Agente:** *llama a `evaluate_install_gate({ package_name: "@playwright/mcp" })`*
>
> **Agente:** REVIEW. Se resuelve correctamente y es trazable hasta `microsoft/playwright-mcp` con actividad de mantenimiento reciente, pero anuncia automatización de navegador — confirma el límite exacto del sistema (qué sitios, qué perfil de navegador) antes de habilitarlo.

## Cómo funciona

```
nombre del paquete npm
      │
      ▼
┌─────────────────┐     ┌──────────────────────┐
│  registro npm    │────▶│ 9 comprobaciones     │
│  GitHub API      │     │ deterministas (regex │
│  (caché, ETag)   │     │ para señales)        │
└─────────────────┘     └──────────┬───────────┘
                                    ▼
                        veredicto: GO / REVIEW / BLOCK
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                                ▼
          fingerprint guardado               evidencia + razones +
          ~/.mcp-trust-gate/                 acciones recomendadas
          fingerprints/<pkg>.json            devueltas al agente
                    │
                    ▼
          comparación con la próxima
          evaluación → ¿deriva detectada?
```

Las comprobaciones se ejecutan sobre los metadatos del registro npm y, cuando se puede resolver un repositorio público de GitHub, sobre los metadatos del repositorio (estado de archivado, último push). No se ejecuta nada — es una evaluación estática de metadatos, no un sandbox ni un escaneo en tiempo de ejecución.

## Comparativa

| | `mcp-trust-gate` | Revisión manual del README | `npm audit` | Escaneo de Smithery |
|---|---|---|---|---|
| Responde «¿a qué puede acceder este servidor MCP?» | ✅ veredicto estructurado | ⚠️ depende del revisor | ❌ solo CVE de dependencias | ⚠️ del lado del marketplace, no local |
| Se ejecuta antes de instalar, desde el propio agente | ✅ llamada a herramienta MCP | ❌ manual | ❌ manual | ❌ panel web |
| Veredicto determinista y reproducible | ✅ | ❌ varía por revisor | ✅ (para CVE) | ⚠️ puntuación opaca |
| Detecta deriva desde la última aprobación | ✅ fingerprint + deriva | ❌ | ❌ | ❌ |
| Audita toda la configuración del cliente en una llamada | ✅ `scan_config` | ❌ | ❌ | ❌ |
| Escanea vulnerabilidades conocidas de dependencias | ❌ (fuera de alcance) | ❌ | ✅ | ⚠️ parcial |

## FAQ

**¿Hace llamadas de red?**
Sí. `evaluate_install_gate` y `scan_config` consultan el registro npm (`registry.npmjs.org`) y, cuando se puede resolver un repositorio de GitHub a partir de los metadatos del paquete, la API REST de GitHub (`api.github.com`). Las respuestas se cachean en memoria durante 5 minutos, con solicitudes condicionales (ETag) a GitHub para reducir la presión sobre los límites de tasa.

**¿Necesita una clave de API?**
No. Ambas API se consultan sin autenticación. Las llamadas no autenticadas a la API de GitHub tienen límites más agresivos — si alcanzas ese límite, las comprobaciones que dependen de metadatos del repositorio degradan con gracia en lugar de hacer fallar la evaluación.

**¿Qué tan preciso es el veredicto?**
Las comprobaciones son detección determinista de señales por regex sobre los metadatos del paquete npm (descripción, keywords, nombres de bin, campos adyacentes al README) — no una auditoría en tiempo de ejecución ni a nivel de código. Interpreta `GO` como «sin banderas rojas evidentes en los metadatos», no como «verificado formalmente como seguro». Los veredictos `REVIEW` y `BLOCK` incluyen la evidencia concreta que los disparó para que juzgues por ti mismo.

**¿Qué pasa con un servidor MCP solo-GitHub o no publicado en npm?**
V1 solo evalúa objetivos publicados en npm. `scan_config` omite los servidores que no se ejecutan vía `npx`/nombre de paquete npm y los reporta como `SKIPPED` en lugar de adivinar.

**¿Dónde se guardan los datos de fingerprint?**
Localmente, en `~/.mcp-trust-gate/fingerprints/<package-name>.json`. No se envía nada a ningún sitio. Cada llamada a `evaluate_install_gate` compara con el último fingerprint guardado y reporta `driftDetected` si cambió el dominio de acceso, la capacidad de mutación, el requisito de secretos o la señal de persistencia.

## Limitaciones

- V1 solo evalúa servidores MCP publicados en npm con una entrada resoluble en `registry.npmjs.org`.
- `scan_config` solo parsea los formatos `.mcp.json` y `claude_desktop_config.json`; todavía no parsea los formatos específicos de Cursor/Windsurf/Cline.
- Las comprobaciones son heurísticas estáticas de metadatos, no un sandbox de ejecución, ni auditoría de código, ni escaneo de vulnerabilidades de dependencias.
- Las llamadas no autenticadas a la API de GitHub están sujetas a los límites públicos de GitHub.

## Changelog

Ver [CHANGELOG.md](./CHANGELOG.md).

## Licencia

MIT
