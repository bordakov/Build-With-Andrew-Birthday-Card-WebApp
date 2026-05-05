# Birthday Card WebApp(s)

Project(s) created during the DeepLearning.AI course  
"Build with Andrew"

## Description

This repository contains small web application(s) for creating birthday cards.

---

## Project Structure

### `Birthday-Card-WebApp/DeepLearningAIStartedChatGPTFinished/`

A simple web application for generating funny birthday cards.  
This particular app was started with the internal AI chat of the DeepLearning.AI course and continued with ChatGPT.  
The app allows you to input a name, age, and hobby, generate a message, refine it using AI,  
load or upload a birthday card image, customize layout and design (font, size, color, alignment),  
position the message on the card, and export the final result as text or image.

Inside this folder:

### `file.html`

Frontend user interface.

* Contains the form (name, age, hobby)
* Displays the generated message
* Provides buttons to generate and refine messages

### `file.js`

Frontend logic.

* Generates initial funny messages locally
* Sends requests to the backend for AI refinement
* Handles UI interactions and cooldown logic

### `server.py`

Backend server (Python + Flask).

* Serves the web app
* Handles API requests (`/api/refine`)
* Calls the OpenAI API to refine messages
* Uses environment variables for API keys

### `.env` / `.env.example`

Configuration files for environment variables.

* `.env` → contains your real API key (not committed)
* `.env.example` → template with placeholders

---

## How to Run the Application

### Requirements

- Python 3.x

### 1. Get the application files

Fetch the contents of the `Birthday-Card-WebApp/DeepLearningAIStartedChatGPTFinished/` folder from this repository into a local folder on your machine (the folder name can be anything).

For example, you can download the repository as a ZIP or clone it using Git.

In this guide, we will refer to that local folder as `BDayFolder`.

---

### 2. Install dependencies

Make sure you have Python installed, then install required packages:

```bash
pip install flask python-dotenv requests
```

---

### 3. Set up environment variables

Create a `.env` file inside `BDayFolder`:

```env
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-3.5-turbo
```

---

### 4. Start the server

From inside `BDayFolder`, run:

```bash
python server.py
```

You should see:

```
[server] Starting server at http://127.0.0.1:5000
```

---

### 5. Open the app in your browser

Go to:

```
http://127.0.0.1:5000
```

---

## How to Use

1. Enter the following:

   * Name
   * Age
   * Hobby

2. Click **Generate Funny Message**

3. Optionally refine using:

   * Refine with AI
   * Make it Shorter
   * Make it Funnier

4. Customize the birthday card appearance:

   * Select or upload a background image
   * Adjust font family, size, and color
   * Choose text alignment
   * Drag and position the message on the card

5. Export or copy the result:

   * Copy the message text
   * Download or copy the rendered card image

---

## Notes

* The app works without AI for basic message generation
* AI refinement requires a valid OpenAI API key
* There is a short cooldown between AI requests to avoid rate limits

---

## Author

George Bordakov

---

## License

This project is licensed under the MIT License.

Some portions were created with the assistance of AI tools.
