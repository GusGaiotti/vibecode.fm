# vibecode.fm

[English](README.md) · **Português** · [Español](README.es.md)

<img width="400" height="400" alt="Logo" src="https://github.com/user-attachments/assets/ea5b748b-9fd1-47c3-9f9a-910ccc3ec20f" />

**Uma trilha sonora pro seu agente de código — toca enquanto o Claude Code trabalha e para no instante em que é a sua vez.**

O Claude começa a trabalhar, a música entra. Ele te devolve o turno, a música para. Você *ouve*
quando o agente está ocupado e quando ele precisa de você, sem ficar preso na tela. Uma status
line temática mostra a faixa, a estação e o estado — e tudo roda sozinho.

<img width="1882" height="141" alt="Captura de tela 2026-07-26 151637" src="https://github.com/user-attachments/assets/b6b406dd-33f8-4ac7-8417-34fd8fb2e4d5" />

## Como funciona

<img width="1867" height="727" alt="Captura de tela 2026-07-26 151956" src="https://github.com/user-attachments/assets/f7eda0ba-5397-4196-a1df-2899ab2fa5ce" />

O plugin liga os [hooks do Claude Code](https://code.claude.com/docs/en/hooks) a uma instância
do [mpv](https://mpv.io) rodando ao fundo, pelo canal JSON IPC dele:

| O que acontece | A música |
|---|---|
| Você envia um prompt | ▶ toca |
| O Claude roda uma ferramenta | ▶ toca |
| Aparece um pedido de permissão (sim/não) | ▶ continua tocando |
| O Claude termina o turno | ⏸ pausa |
| A sessão encerra | ⏸ pausa |

É um único binário nativo, sem dependências. Os hooks sempre saem com código 0 e nunca quebram
uma sessão; se o mpv não estiver instalado, o plugin simplesmente não faz nada, em silêncio.

## Requisitos

- **[mpv](https://mpv.io)** no seu `PATH`:

```sh
brew install mpv                 # macOS
sudo apt install mpv             # Debian / Ubuntu
winget install shinchiro.mpv     # Windows
```

Só isso — sem runtime, sem interpretador. O binário é autocontido. Uma única base de código para
**Windows, macOS, Linux e WSL**; a suíte de testes roda nos três na CI.

## Instalação

No Claude Code:

```
/plugin marketplace add GusGaiotti/vibecode.fm
/plugin install vibecode-fm@vibecode-fm
```

Pegue o binário. Baixe o pronto pra sua plataforma na
[última release](https://github.com/GusGaiotti/vibecode.fm/releases/latest), ou compile você
mesmo (precisa do [toolchain do Rust](https://rustup.rs)):

```sh
cargo build --release        # gera target/release/vibecode-fm
```

Coloque o binário em `bin/vibecode-fm` (ou `bin/vibecode-fm.exe` no Windows) dentro do plugin,
e aponte sua status line pra ele (no `settings.json`):

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/plugins/marketplaces/vibecode-fm/bin/vibecode-fm statusline"
  }
}
```

Envie um prompt e a música começa.

## Comandos

| Comando | O que faz |
|---|---|
| `/vibecode-fm:vibe` | Modo DJ — o Claude escolhe a estação que combina com a sua sessão |
| `/vibecode-fm:radio <vibe>` | Troca pra uma estação específica |
| `/vibecode-fm:next` | Pula pra próxima estação |
| `/vibecode-fm:volume <up\|down\|0-100>` | Ajusta o volume |
| `/vibecode-fm:focus <on\|off>` | On (padrão): pausa quando é a sua vez. Off: toca sem parar |
| `/vibecode-fm:minimal <on\|off>` | Status line mostra só o nome da música (sem sprites/frase) |
| `/vibecode-fm:on` / `:off` | Liga / desliga o plugin |
| `/vibecode-fm:help` | Referência de comandos e configurações |

**Vibes:** chill, ambient, metal, jazz, synthwave, hacker, beats, indie, spy, vaporwave,
space, glitch, tavern, goa, bossa, seventies, reggae, dubstep, lounge, folk — 20 canais
selecionados do [SomaFM](https://somafm.com) (grátis, legal, sem login), cada um com suas
próprias cores, ícones e frases na status line. Sinônimos comuns também funcionam (`lofi`,
`retro`, `defcon`, `drone`, `hiphop`, `psy`, `agent`…).

## A status line

Ela mostra a faixa atual à esquerda, sprites temáticos flutuando e uma frase rotativa no meio,
e o modelo à direita. Os sprites se mexem enquanto o Claude trabalha e ficam parados quando é a
sua vez; cores, ícones e frases vêm todos do tema da estação atual.

Prefere algo mais discreto? Configure no bloco `env` do seu `settings.json`:

| Variável | Efeito |
|---|---|
| `VIBECODE_MINIMAL=1` | Só o ícone e o título |
| `VIBECODE_SPRITES=0` | Remove os sprites (mantém a frase) |
| `VIBECODE_SPLASH=0` | Remove a frase (mantém os sprites) |

## Configuração

Tudo opcional, via variáveis de ambiente:

| Variável | Padrão | Significado |
|---|---|---|
| `VIBECODE_VOLUME` | `70` | Volume (0–100) |
| `VIBECODE_SOURCE` | playlist embutida | Qualquer arquivo, URL ou `.m3u` que o mpv abra |
| `VIBECODE_STATIONS` | `~/.vibecode-fm/stations.json` | Seu arquivo de estações customizadas |
| `VIBECODE_MPV_BIN` | `mpv` | Caminho do mpv se ele não estiver no `PATH` |
| `VIBECODE_MPV_ARGS` | — | Flags extras do mpv (ex.: `--ao=pulse` no WSL) |
| `VIBECODE_DEBUG` | off | Registra decisões e tempos dos hooks no diretório de estado |

### Estações customizadas

Adicione as suas em `~/.vibecode-fm/stations.json` — uma URL simples, ou um objeto com rótulo e
tema de status line:

```json
{
  "focus": "https://stream.example/focus.mp3",
  "night": {
    "url": "https://stream.example/night.mp3",
    "label": "Night Drive",
    "theme": { "stops": [{ "p": 0, "c": [80, 80, 180] }, { "p": 1, "c": [220, 220, 255] }],
               "sprites": ["✦", "★", "·", "♪"] }
  }
}
```

Por padrão toca o [SomaFM](https://somafm.com) — que se mantém com doações dos ouvintes, então
[considere doar](https://somafm.com/support/) se ele virar sua trilha sonora.

## Limitações conhecidas

São restrições do Claude Code / do terminal, não bugs — documentadas por honestidade:

- **Ctrl+C não pausa.** Interromper um turno não dispara hook nenhum, então o plugin não tem
  como reagir; a música pausa no próximo turno que terminar normalmente.
- **A status line atualiza no ritmo de repintura do Claude Code**, não sob demanda, então a
  transição toca/pausa pode atrasar um instante. A animação dos sprites é baseada em tempo pelo
  mesmo motivo — não dá pra sincronizar com o áudio.
- **Um comando longo que você aprova fica em silêncio até terminar** — não há hook pra "ferramenta
  iniciou após aprovação", então a música volta quando a ferramenta acaba. Ferramentas rápidas
  voltam de forma imperceptível. (`/focus off` contorna isso nunca pausando.)
- **O áudio foi verificado no Windows.** O código é cross-platform e a CI passa no macOS e no
  Linux, mas o teste de áudio real nesses sistemas está pendente da comunidade — reporte problemas.

## WSL

No WSL o mpv muitas vezes cai numa saída quebrada e toca em silêncio. Force o PulseAudio:

```sh
echo 'export VIBECODE_MPV_ARGS="--ao=pulse"' >> ~/.bashrc
```

## Desenvolvimento

```sh
cargo test           # testes unitários, sem precisar de hardware de áudio
cargo fmt --check    # formatação
cargo clippy -- -D warnings
```

Veja [CONTRIBUTING.md](CONTRIBUTING.md).

## Licença

[MIT](LICENSE) © Gustavo Gaiotti
