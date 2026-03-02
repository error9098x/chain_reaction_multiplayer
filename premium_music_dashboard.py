import gradio as gr
import torch
import scipy.io.wavfile
import numpy as np
from diffusers import AudioLDM2Pipeline
import tempfile
import os

print("Loading AudioLDM2 model. This might take a minute on the first run to download the weights...")
# Using the small version for faster generation, but it still produces great quality
repo_id = "cvssp/audioldm2"
pipe = AudioLDM2Pipeline.from_pretrained(repo_id, torch_dtype=torch.float32)

# If on Mac with Apple Silicon (M1/M2/M3), use MPS for acceleration
if torch.backends.mps.is_available():
    pipe = pipe.to("mps")
    print("Using Apple Silicon (MPS) acceleration!")
elif torch.cuda.is_available():
    pipe = pipe.to("cuda")
    print("Using CUDA acceleration!")
else:
    print("Using CPU. Generation might be a bit slow.")

def generate_music(prompt, negative_prompt, duration, num_inference_steps, guidance_scale):
    print(f"Generating audio for prompt: '{prompt}'...")
    
    # We want to generate music, not just sound effects, so we set audio_length_in_s
    # AudioLDM2 uses standard 16kHz sample rate internally usually, or 48kHz for the music wrapper 
    try:
        audio = pipe(
            prompt,
            negative_prompt=negative_prompt,
            num_inference_steps=int(num_inference_steps),
            audio_length_in_s=float(duration),
            guidance_scale=float(guidance_scale)
        ).audios[0]
        
        # AudioLDM2 returns an array of shape (length,)
        
        # We need to return (sample_rate, data) for Gradio
        # The default sample rate for AudioLDM2 generally is 16000
        sample_rate = 16000
        
        # Convert to int16 for Gradio audio
        audio_int16 = np.int16(audio * 32767)
        
        return (sample_rate, audio_int16)
        
    except Exception as e:
        print(f"Error generating audio: {e}")
        return None

if __name__ == '__main__':
    with gr.Blocks(title="Production Game Music Generator") as demo:
        gr.Markdown("# 🎧 Production Quality Game Music / Ambience Generator")
        gr.Markdown("Uses **AudioLDM2** (an AI Diffusion model similar to Midjourney but for sound) to generate high-quality, production-ready music, ambient tracks, and soundscapes based on text descriptions.")
        
        with gr.Row():
            with gr.Column():
                prompt = gr.Textbox(
                    label="Prompt (Describe the music/sound you want)", 
                    placeholder="e.g. Epic orchestral boss battle music with heavy percussion and choir",
                    lines=3
                )
                negative_prompt = gr.Textbox(
                    label="Negative Prompt (What to avoid)", 
                    placeholder="e.g. vocals, speech, noise, static, low quality",
                    value="low quality, noise, static, sudden cut off"
                )
                
                with gr.Accordion("Advanced Settings", open=True):
                    duration = gr.Slider(minimum=2.0, maximum=15.0, value=10.0, step=1.0, label="Duration (seconds)")
                    num_inference_steps = gr.Slider(minimum=10, maximum=100, value=25, step=1, label="Quality (Inference Steps - higher is better but slower)")
                    guidance_scale = gr.Slider(minimum=1.0, maximum=15.0, value=3.5, step=0.1, label="Prompt Adherence (Guidance Scale)")
                
                generate_btn = gr.Button("🎧 Generate Music (Takes ~10-30s)", variant="primary")
            
            with gr.Column():
                audio_output = gr.Audio(label="Generated Audio")
                
                gr.Markdown("### Try these example prompts:")
                gr.Examples(
                    examples=[
                        ["Cinematic ambient space music, vast empty void, synthesizer pads, high quality", "noise, vocals", 10.0, 30, 3.5],
                        ["Upbeat electronic cyberpunk racing background music, fast tempo, heavy bass", "slow, acoustic, voices", 10.0, 30, 4.0],
                        ["Spooky mysterious dungeon ambience, water dripping, subtle low strings, dark", "loud percussion, happy, cheerful", 10.0, 25, 3.5],
                        ["Relaxing acoustic guitar melody for a farming simulator game menu screen", "distortion, heavy drums", 10.0, 25, 3.0]
                    ],
                    inputs=[prompt, negative_prompt, duration, num_inference_steps, guidance_scale]
                )
                
        generate_btn.click(
            generate_music, 
            inputs=[prompt, negative_prompt, duration, num_inference_steps, guidance_scale], 
            outputs=audio_output
        )

    demo.launch(server_name="127.0.0.1", server_port=7861)
