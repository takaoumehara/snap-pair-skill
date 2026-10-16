# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mini-apps.spec.ts >> Mini Apps - Co-Drawing >> should pair two devices and draw on shared canvas
- Location: tests/mini-apps.spec.ts:114:3

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to content":
    - /url: "#geist-skip-nav"
  - generic [ref=e3]:
    - banner [ref=e4]:
      - link "Vercel logo":
        - /url: /home
        - button [ref=e5] [cursor=pointer]:
          - img "Vercel Logo" [ref=e6]
      - navigation [ref=e8]:
        - navigation [ref=e9]:
          - link [ref=e10] [cursor=pointer]:
            - /url: /signup?next=%2Fsso-api%3Furl%3Dhttps%253A%252F%252Fsnap-pair-skill-git-curs-d29709-takaoumehara-gmailcoms-projects.vercel.app%252Fmini%252Fdraw%252F%253Fdebug%253D1%26nonce%3Dc9778a7c64f27b6b8f4ffb1d6f016e9c9690e689d96ea373cfeb786f6a6e3a6e
            - paragraph [ref=e12]: Sign Up
    - main [ref=e13]:
      - generic [ref=e15]:
        - heading "Log in to Vercel" [level=1] [ref=e18]
        - generic [ref=e19]:
          - generic [ref=e20]:
            - textbox "Email Address" [ref=e23]
            - button "Continue with Email" [ref=e26] [cursor=pointer]
          - generic [ref=e29]:
            - button "Continue with Google" [ref=e30] [cursor=pointer]:
              - generic [ref=e34]:
                - generic [ref=e35]: Continue with
                - text: Google
            - button "Continue with GitHub" [ref=e36] [cursor=pointer]:
              - generic [ref=e40]:
                - generic [ref=e41]: Continue with
                - text: GitHub
            - button "Continue with ChatGPT" [ref=e42] [cursor=pointer]:
              - generic [ref=e46]:
                - generic [ref=e47]: Continue with
                - text: ChatGPT
            - button "Continue with SAML SSO" [ref=e49] [cursor=pointer]
            - button "Continue with Passkey" [ref=e54] [cursor=pointer]
            - button "Show other options" [ref=e59] [cursor=pointer]
        - paragraph [ref=e62]:
          - text: Don't have an account?
          - link "Sign Up" [ref=e63] [cursor=pointer]:
            - /url: /signup?next=%2Fsso-api%3Furl%3Dhttps%253A%252F%252Fsnap-pair-skill-git-curs-d29709-takaoumehara-gmailcoms-projects.vercel.app%252Fmini%252Fdraw%252F%253Fdebug%253D1%26nonce%3Dc9778a7c64f27b6b8f4ffb1d6f016e9c9690e689d96ea373cfeb786f6a6e3a6e
      - generic [ref=e66]:
        - link "Terms" [ref=e67] [cursor=pointer]:
          - /url: /legal/terms
        - link "Privacy Policy" [ref=e68] [cursor=pointer]:
          - /url: /legal/privacy-policy
  - alert [ref=e69]
```