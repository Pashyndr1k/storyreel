# Cloud generation prices: ComfyUI partner nodes vs first-party APIs vs Krea

Researched 6 October 2026 from the providers' own pages (links at the end).
Prices change often; treat this as a snapshot.

## How the three routes bill

| Route | Unit | Notes |
| --- | --- | --- |
| **ComfyUI partner nodes** (Comfy Cloud / API nodes) | credits, **211 credits = $1** (Comfy Router pricing page) | Prepaid via Stripe; monthly plan credits expire at period end, top-ups after 1 year. Plans: Standard $20/mo = 4,200 credits (~$19.9), Creator $35 = 7,400, Pro $100 = 21,100 (so plan credits are worth about what you pay). Partner nodes need credits — no free tier for them. Comfy Cloud GPU time is billed separately from the same credits. |
| **First-party APIs** | USD per image / per second / per token | Google (Gemini API), Kling (prepaid "units", $0.14 each at list; packs from $9.80), MiniMax (pay-as-you-go), BytePlus ModelArk (tokens), Lightricks, Alibaba Model Studio, Runway (credits, $0.01 each), OpenAI (tokens). Each needs its own account, key and balance. |
| **Krea API** (what StoryReel 2.14 uses) | USD, fixed price per model and parameters | One prepaid USD balance for every model; failed and cancelled jobs are not billed. |

Local ComfyUI (what StoryReel uses for MiniMax H3, LTX-2.3 and Flux.2 Klein)
costs nothing per generation beyond electricity: an RTX-3060-class GPU at
~170 W for the ~9 minutes a 5 s HD H3 shot takes is about 0.03 kWh, i.e.
well under one cent.

## Image models (per image)

| Model | First party | ComfyUI partner node | Krea API |
| --- | --- | --- | --- |
| Nano Banana (gemini-2.5-flash-image) | Google **$0.039** | 6.33 cr/1K output tokens → ~8.2 cr = **$0.039** | not on the API list |
| Nano Banana Pro, 1K/2K | Google **$0.134** | 30.38 cr/1K tokens → ~34 cr = **$0.16** | **$0.15** |
| Nano Banana Pro, 4K | Google **$0.24** | ~61 cr = **$0.29** | **$0.30** |
| Nano Banana 2, 1K | Google **$0.067** | 15.19 cr/1K tokens → ~17 cr = **$0.08** | **$0.08** |
| Nano Banana 2, 2K | Google **$0.101** | ~25.6 cr = **$0.12** | **$0.12** |
| GPT Image 2 (output tokens) | OpenAI **$30 / 1M** | 7,600 cr/1M = **$36 / 1M** (+20 %) | ChatGPT Image: **$0.3747 per request** flat (any quality); "from $0.03" on the marketing page |
| Seedream 5 Pro, ≤2.4 MP / larger | BytePlus **$0.045 / $0.09** (+$0.003 per extra reference) | 9.50 / 18.99 cr = **$0.045 / $0.09** | **$0.045 / $0.09** (+$0.003 per reference) |
| Krea 2 Large (text only / style refs / moodboard) | Krea **$0.06 / 0.065 / 0.07** | 12.66 / 13.72 / 14.77 cr = **$0.06 / 0.065 / 0.07** | same |
| Krea 2 Medium | Krea **$0.03 / 0.035 / 0.04** | 6.33 / 7.39 / 8.44 cr = same | same |
| Runway Gen-4 Image | Runway **$0.05** (720p) / **$0.08** (1080p) | 24.14 cr = **$0.114** | not priced on its page |

Reading: Google, ByteDance and Krea-2 images cost the same through ComfyUI
as directly. Nano Banana Pro / 2 and GPT Image 2 are billed at a token rate
about 20 % above Google's / OpenAI's. Krea charges Google's models at a
rounded fixed price (10–20 % above Google for Pro / 2).

## Video models (per second of output unless stated)

| Model | First party | ComfyUI partner node | Krea API |
| --- | --- | --- | --- |
| Kling 3.0, 720p std, silent | Kling **$0.084** (0.6 units) | kling-v3-omni 720p: 17.72 cr = **$0.084** | **$0.084** |
| Kling 3.0, 1080p pro, silent | Kling **$0.112** (0.8 units) | 23.63 cr = **$0.112** | **$0.112** |
| Kling 3.0 with native audio, 720p / 1080p | Kling **$0.126 / $0.168** | omni audio on: 23.63 / 29.54 cr = **$0.112 / $0.14** | **$0.126 / $0.168** |
| Kling 3.0, 4K | Kling **$0.42** | 88.62 cr = **$0.42** | **$0.42** |
| Kling 2.6, silent | Kling **$0.07** (0.5 units) | 14.77 cr = **$0.07** (audio on: 29.54 = $0.14) | **$0.07** |
| Veo 3.1 standard, 720p/1080p, with audio | Google **$0.40** | 84.4 cr = **$0.40**; silent 42.2 = $0.20 | silent **$0.20**; 4K with audio $0.60 |
| Veo 3.1 standard, 4K with audio | Google **$0.60** | 126.6 cr = **$0.60** | **$0.60** |
| Veo 3.1 Fast, 720p with audio | Google **$0.10** | 21.1 cr = **$0.10** (silent 16.88 = $0.08) | — |
| Veo 3.1 Lite, 720p / 1080p with audio | Google **$0.05 / $0.08** | 10.55 / 16.88 cr = **$0.05 / $0.08** | — |
| MiniMax H3, 768p | MiniMax **$0.08** | 27.16 cr = **$0.129** | **$0.13** (5 s = $0.65; no resolution choice) |
| MiniMax H3, 2K | MiniMax **$0.13** | 39.22 cr = **$0.186** | — |
| MiniMax H3 Max, 480p / 768p | MiniMax **$0.05 / $0.08** | 15.09 / 24.14 cr = **$0.072 / $0.114** | **$0.05 / $0.08** (1080p ≈ $0.16) |
| Seedance 2.0, 720p | BytePlus **~$0.15** ($7.00 / 1M tokens) | 2.112 cr/1K tokens = $10 / 1M → **~$0.22** | **$0.30** ($0.18 with a video reference) |
| Seedance 2.0, 1080p | BytePlus **~$0.37** ($7.70 / 1M tokens) | 2.323 cr/1K = $11 / 1M → **~$0.54** | **$0.68** |
| LTX-2.5 Pro, 720p / 1080p | Lightricks **$0.12 / $0.17** | 36.21 / 51.29 cr = **$0.17 / $0.24** | **$0.12 / $0.17** |
| LTX-2.5 Fast, 720p / 1080p | Lightricks **$0.09 / $0.13** | 27.16 / 39.22 cr = **$0.13 / $0.19** | — |
| Wan 3.0, 480p / 720p / 1080p | Alibaba **$0.05 / $0.10 / $0.20** list (a 30 % Model Studio promotion ran to 24 Sep 2026) | 15.09 / 30.17 / 60.35 cr = **$0.072 / $0.143 / $0.286**, with "30 % discount through Sept 2026" noted → **= list after the discount** | **$0.075 / $0.15 / $0.30** |
| Gemini Omni Flash 1.1, 720p | Google **$0.10** ($0.03 at 360p, $0.15 at 1080p, $0.30 at 4K) | not offered | price not published on its page |
| Runway Gen-4.5 | Runway **$0.12** (12 credits) | not offered (Gen-4 Turbo: 15.09 cr = $0.072 vs Runway $0.05) | **$0.12** |

Token formula for Seedance (BytePlus and ComfyUI): tokens = (input s + output s)
× width × height × fps ÷ 1024; at 24 fps a 720p second is ~21,600 tokens and
a 1080p second ~48,600.

## What the numbers say

1. **ComfyUI partner nodes are at list price for Google (Nano Banana, Veo),
   Kling, Krea 2 and Seedream** — the credit figures convert to the cents the
   providers charge, often to the cent (6.33 cr = $0.03, 126.6 cr = $0.60).
   There is no hidden markup there; the convenience is one balance and no
   extra accounts.
2. **ComfyUI is ~20 % above list for Nano Banana Pro / 2 and GPT Image 2**
   (token rates of $0.144 and $0.036 per 1K/1M against Google's $0.12 and
   OpenAI's $0.030).
3. **ComfyUI is ~1.4–1.6× list for MiniMax H3 / H3 Max, Seedance 2.0,
   LTX-2.5, Wan 3.0 and Runway Gen-4 Turbo / Gen-4 Image.** The 1.43 factor
   is exactly 1 / 0.7; for Wan the page itself says a 30 % discount applies
   through September 2026, so the shown figure is a pre-discount price. The
   other models carry no such note — assume you pay the shown credits.
4. **Krea is at list for Kling, Veo, Seedream, LTX-2.5 Pro, Runway Gen-4.5
   and H3 Max**; 10–20 % above for Google's image models; **1.5× for Wan
   3.0**; **1.6× for MiniMax H3** (Krea bills H3 at the 2K rate, $0.13, with
   no 768p option); **2× for Seedance 2.0** ($0.30 vs $0.15 at 720p). Krea's
   flat ChatGPT Image price ($0.37) is poor value next to OpenAI's tokens.
5. **Cheapest cloud route per model** (silent clips, which is what StoryReel
   wants, since it adds voice and sound itself):
   - Kling 3.0 — all three equal: $0.42 / $0.56 for a 5 s clip at 720p / 1080p.
   - Veo 3.1 — silent $0.20/s on Krea or ComfyUI ($1.00 for 5 s; Google's
     own price list shows only the with-audio rate).
   - MiniMax H3 — MiniMax direct, $0.08/s at 768p ($0.40 for 5 s) vs $0.65 on
     Krea / ComfyUI. H3 Max on Krea or MiniMax at $0.05–0.08/s is the
     cheapest native-audio clip of all.
   - Seedance 2.0 — BytePlus direct ($0.76 for 5 s at 720p); Krea doubles it.
   - LTX-2.5 Pro — Lightricks or Krea ($0.12/s; a 6 s minimum clip = $0.72 at
     720p, $1.02 at 1080p); ComfyUI is 1.4×.
   - Wan 3.0 — Alibaba direct ($0.10/s at 720p); Krea $0.15.
   - Runway Gen-4.5 — Runway or Krea, $0.12/s.
   - First frames — Nano Banana Pro at Google ($0.134) or Krea ($0.15);
     Seedream 5 Pro ($0.045) is a third of the price everywhere; Nano Banana
     (flash) at $0.039 is the cheapest Google frame.
6. **A typical StoryReel shot** (one 2K first frame + one 5 s silent HD clip)
   through Krea: Nano Banana Pro $0.15 + Kling 3.0 pro $0.56 = **$0.71**;
   with Seedream 5 Pro + Kling 3.0 std: $0.045 + $0.42 = **$0.47**. A 3-minute
   short drama episode of ~36 shots is therefore $17–26 in cloud generation
   per take, against a few cents of electricity on the local ComfyUI path.

## For StoryReel

- Krea stays the sensible single-balance route for Kling, Veo, LTX-2.5 Pro,
  Runway and Seedream — same price as going direct, one key.
- For MiniMax H3 at 768p, Seedance 2.0 and Wan 3.0 a direct account is
  1.5–2× cheaper than Krea; worth a direct engine only if those models are
  used a lot (MiniMax's API would be the first candidate: H3 is the app's
  default local model and its prompt format already exists).
- ComfyUI partner nodes would not save money over Krea for any model in the
  table and are 1.4× dearer for H3, LTX and Seedance; they only make sense if
  the user already runs workflows in Comfy Cloud.

## Sources

- ComfyUI partner node pricing: https://docs.comfy.org/tutorials/partner-nodes/pricing
- Comfy credits = $1 / 211: https://docs.comfy.org/development/comfy-router/pricing ; plans: https://comfy.org/pricing/
- Google Gemini API pricing (Nano Banana, Veo 3.1, Omni): https://ai.google.dev/gemini-api/docs/pricing
- Kling API units and 3.0 rates: https://costbench.com/software/ai-media-apis/kling-api/ , https://renderful.ai/blog/kling-api-pricing
- MiniMax pricing: https://platform.minimax.io/docs/pricing/overview , https://platform.minimax.io/docs/guides/pricing-paygo
- BytePlus Seedance 2.0: https://www.byteplus.com/en/topic/578667 , https://technode.com/2026/03/05/bytedances-seedance-2-0-video-model-costs-about-0-14-per-second/ ; Seedream 5 Pro: https://www.atlascloud.ai/blog/ai-updates/seedream-5-0-pro-price
- Lightricks LTX API pricing: https://ltx.io/model/api/pricing
- Alibaba Wan 3.0: https://datanorth.ai/news/alibaba-launches-wan3-0-video-model , https://magica.com/news/alibaba-wan-3-fal-30-second-video
- Runway API pricing: https://docs.dev.runwayml.com/guides/pricing
- OpenAI pricing: https://developers.openai.com/api/docs/pricing
- Gemini Omni 1.1 Flash pricing: https://apidog.com/blog/gemini-omni-1-1-flash-pricing/
- Krea API prices: https://www.krea.ai/features/api and the per-model pages under https://www.krea.ai/docs/api-reference/ (kling-30, kling-26, veo-31, minimax-h3, minimax-h3-max, seedance-20, ltx-25-pro, wan-30, runway-gen-45, nano-banana-pro, nano-banana-2, seedream-5-pro, chatgpt-image) and https://www.krea.ai/docs/developers/krea-2/overview
