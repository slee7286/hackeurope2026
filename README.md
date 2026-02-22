## Inspiration

Having seen firsthand the challenges of stroke recovery, a member of our team knows all too well the shortcomings of today’s computer aided speech and language therapy. Existing apps have become a cornerstone of care, giving patients the independence to practise in their own time. However, they rarely adapt to what each person actually needs to say and understand day to day. With modern AI, therapy can be tailored to the individual, with exercises that reflect their lives in content and delivery in a familiar voice.

## What it does

Speech-Therapy.ai uses agentic AI to create custom lessons for patients, and Elevenlabs' extensive library of regional accents and voice cloning capabilities to provide lessons in an accent the patient is familiar with. In turn, helping patients to recovery in their own time and to their fullest potential.

## How we built it

We built Speech-Therapy.ai as a TypeScript React web app, using Claude’s agentic capabilities to generate and adapt therapy exercises based on conversations with the user. We integrated the ElevenLabs API for high quality text-to-speech so prompts can be delivered clearly, and in a consistent and natural voice, and we used the Unsplash API to pull relevant imagery to support naming and comprehension tasks. Together, these tools let us create a personalised, multimodal therapy experience that adapts in real time.

## Challenges we ran into

Our biggest challenges throughout the project were difficulties that arose from four engineers working on a small codebase at the same time. We resolved (pardon the pun) these issues by clearly communicating what we were working on and coordinating with one another to organise branch merge order. In instances of conflicts we used coding agents to clean up the mess.

We took significant time to formulate prompts that evoked the desired behavior and tone from Claude agents.

## Accomplishments that we're proud of

We are particularly proud of including voice cloning in the project, due to time constraints this at a time seemed in doubt. More generally, we are proud of a product that has the potential to assist people in reclaiming their lives after tragedy.

## What we learned

We were all astonished by how much we achieved in the time frame. We’ll take it as a lesson in what’s possible when we stay focused and work well in a team. From talking to the very impressive builders around us at this incredible event we have learnt that by believing in an idea and persevering with it you can take something from a sketch to an MVP, to eventually a business.

## What's next for Speech-Therapy.ai

With more refinement and guardrails we will have an app ready to test with real patients. We will build relationships and in turn gain the trust of speech and language therapists in Ireland and the UK, from which they will feel confident in recommending our product. We will also contact researchers in stroke rehabilitation to run rigorous academic evaluations and build a strong evidence base. That clinical backing will give patients, clinicians, and healthcare providers the confidence to adopt our application, helping us to earn trust quickly and scale globally.
