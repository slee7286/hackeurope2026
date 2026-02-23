## Inspiration

Aphasia (pronounced Uh-FAY-zhuh) is a communication disorder caused by a stroke or brain injury [[1](https://aphasia.org/what-is-aphasia/)]. The lifetime risk of stroke has increased by 50% over the past 20 years, with 1 in 4 adults predicted to experience a stroke in their lifetime [[2](https://www.who.int/news-room/fact-sheets/detail/stroke)]. 38% of poeple who have a stroke get aphasia at the time of the stroke [[3](https://aphasia.org/statistics/)].

Research has shown that those suffering from aphasia have particular difficulty understanding accents that are unfamiliar to them and it has been concluded that speaker accent should be accoutned for in the rehabilitation of individuals suffering from aphasia after a stroke [[4](https://pubmed.ncbi.nlm.nih.gov/22360727/)] [[5](https://pubmed.ncbi.nlm.nih.gov/20178407/)].

Having seen firsthand the challenges of stroke recovery, a member of our team knows all too well the shortcomings of today’s computer aided speech and language therapy. Existing apps have become a cornerstone of care, giving patients the independence to practise in their own time. However, they often provide limited accent customisability and do not adjust to topics relevant to the individual's daily life. With modern AI, therapy can be tailored to the individual, with exercises that reflect their lives, delivered in a familiar voice.

With this as motivation, we built Speech-Therapy.ai. An app that uses AI agents, voice recognition, voice generation and voice cloning capabilities to provide immersive and personalised speech and language therapy.

## What it does

An AI agent runs a check-in conversation from which it generates personalized speech and language exercises.
It supports multimodal therapy tasks including picture-based exercises and voice interactions. All in an accent familiar to the user.

[![DEMO](https://img.youtube.com/vi/NsYpCqlzSlw/0.jpg)](https://www.youtube.com/watch?v=NsYpCqlzSlw)

## How we built it

We built Speech-Therapy.ai as a TypeScript + React web app with a TypeScript/Express backend.
* Claude powers the check-in agent, plan generation, and semantic answer evaluation.
* ElevenLabs provides an extensive library of high-quality text-to-speech voices and voice cloning capabilities.
* Google Cloud Speech-to-Text API powers speech transcription of user responses.
* Unsplash provides image options for picture-description tasks.
* A therapy engine manages session flow, scoring, and feedback across question types.
* Session summaries/history are stored in a lightweight local JSON store designed to easily be extended to use MongoDB in production.
This architecture lets us deliver a personalized, voice-first, and visually supported therapy experience.

## Technologies Used (Full Stack)

* Languages: TypeScript, JavaScript
* Frontend: React, Vite, Vitest, Testing Library
* Backend: Node.js, Express
* AI/LLM: Anthropic Claude (agent/check-in, plan generation, answer evaluation)
* Voice: ElevenLabs Text-to-Speech API
* Speech Recognition: Google Cloud Speech-to-Text REST API
* Images: Unsplash API
* Storage: In-memory session store + file-based JSON persistence for practice history

## Challenges we ran into

The biggest challenge was parallel development by four engineers in a fast-moving codebase. We resolved (pardon the pun) this with tighter branch discipline, clearer ownership, and explicit merge sequencing. In instances of conflicts we used coding agents to clean up the mess.

We also spent significant time iterating prompts to achieve the right therapeutic tone, structure, and tool-calling behavior from Claude.

## Accomplishments that we're proud of

We’re especially proud that we integrated voice cloning under tight hackathon timelines, allowing stroke patient family members to clone their voice so that stroke patients can go through the rehabilitation program by learning their loved ones’ voices.
More broadly, we built an MVP with real potential to help stroke survivors practice communication in a way that feels personal, practical, and dignified.

## What we learned

We were all astonished by how much we achieved in the time frame. We’ll take it as a lesson in what’s possible when we stay focused and work well in a team. From talking to the very impressive builders and enthusiastic startup founders around us at this incredible event, we have learnt that by believing in an idea and persevering with it you can take something from a sketch to an MVP to eventually a business.

## What's next for Speech-Therapy.ai

With more refinement and guardrails we will have an app ready to test with real patients. We will build relationships and in turn gain the trust of speech and language therapists in Ireland and the UK, from which they will feel confident in recommending our product. We will also contact researchers in stroke rehabilitation to run rigorous academic evaluations and build a strong evidence base. That clinical backing will give patients, clinicians, and healthcare providers the confidence to adopt our application, helping us to earn trust quickly and scale globally.
