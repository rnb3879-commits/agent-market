# Visual update

The interface is now English, with a bronze-black palette, amber light, oversized typography, a visor portrait, and translucent panels inspired by the supplied reference. Forms, statuses, notifications, and default demo responses are translated. Existing user-written briefs and historical results retain their original text.

Hero asset: `public/agent-visor.png`, generated with the built-in ImageGen tool (1536 × 1024).

Prompt: Original cinematic futuristic androgynous portrait, three-quarter profile facing right and looking upward, glossy architectural black VR visor with a continuous brilliant amber rim, cool teal face highlights, dark studio with bronze halo, large subject on right 60 percent, clean almost-black left 40 percent for text, edges blending into black. Premium photorealistic 3D editorial lighting. No text, UI, panels, logos, watermark, or play button.

Validation: TypeScript check and production build passed. API smoke tests: 21 assertions. Domain tests: 7 passed. Browser demo order completed Writer → Editor → result, with English interface and event text. Mobile viewport checked at 390 × 844, without horizontal overflow.

Demo mode continues to use sample text and simulated escrow. No AI calls or real blockchain payments occur in this mode. The contract has not been deployed or audited.
