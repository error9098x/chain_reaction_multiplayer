import gradio as gr
import numpy as np
import random

def generate_wave(freq, duration, sample_rate, wave_type='square'):
    t = np.linspace(0, duration, int(sample_rate * duration), False)
    if wave_type == 'sine':
        wave = np.sin(freq * t * 2 * np.pi)
    elif wave_type == 'square':
        wave = np.sign(np.sin(freq * t * 2 * np.pi))
    elif wave_type == 'sawtooth':
        wave = 2 * (t * freq - np.floor(0.5 + t * freq))
    elif wave_type == 'triangle':
        wave = 2 * np.abs(2 * (t * freq - np.floor(0.5 + t * freq))) - 1
    else:
        wave = np.sin(freq * t * 2 * np.pi)
        
    attack_time = 0.05
    release_time = 0.05
    attack_samples = int(attack_time * sample_rate)
    release_samples = int(release_time * sample_rate)
    
    envelope = np.ones_like(wave)
    if len(envelope) > attack_samples + release_samples:
        envelope[:attack_samples] = np.linspace(0, 1, attack_samples)
        envelope[-release_samples:] = np.linspace(1, 0, release_samples)
    else:
        half = len(envelope) // 2
        envelope[:half] = np.linspace(0, 1, half)
        envelope[half:] = np.linspace(1, 0, len(envelope) - half)
        
    return wave * envelope

def get_scale(root_freq, mood):
    if mood == 'Happy (Major)':
        intervals = [0, 2, 4, 5, 7, 9, 11, 12]
    elif mood == 'Sad (Minor)':
        intervals = [0, 2, 3, 5, 7, 8, 10, 12]
    elif mood == 'Mysterious (Phrygian)':
        intervals = [0, 1, 3, 5, 7, 8, 10, 12]
    elif mood == 'Epic (Dorian)':
        intervals = [0, 2, 3, 5, 7, 9, 10, 12]
    elif mood == 'Upbeat (Pentatonic)':
        intervals = [0, 2, 4, 7, 9, 12]
    else:
        intervals = [0, 2, 4, 5, 7, 9, 11, 12]
        
    return [root_freq * (2 ** (i / 12)) for i in intervals]

def generate_tune(bpm, wave_type, mood, measures, randomness, bass_enabled):
    sample_rate = 44100
    beats_per_measure = 4
    duration_per_beat = 60.0 / bpm
    total_beats = measures * beats_per_measure
    
    root_freq = 261.63 # C4
    scale = get_scale(root_freq, mood)
    
    audio_bits = []
    
    # Bassline scale
    bass_scale = [f / 4 for f in scale]
    
    for beat_idx in range(int(total_beats)):
        subdivisions = random.choice([2, 4]) if random.random() < randomness else 2
        note_duration = duration_per_beat / subdivisions
        
        bass_freq = bass_scale[0] if beat_idx % 2 == 0 else bass_scale[4 % len(bass_scale)]
        
        for sub_id in range(subdivisions):
            freq = random.choice(scale)
            if random.random() < (randomness / 2):
                freq *= 2 # octave up
            
            wave = generate_wave(freq, note_duration, sample_rate, wave_type)
            
            if bass_enabled:
                bass_wave = generate_wave(bass_freq, note_duration, sample_rate, wave_type='triangle')
                wave = (wave * 0.6) + (bass_wave * 0.4)
                
            audio_bits.append(wave)
            
    tune = np.concatenate(audio_bits)
    
    max_val = np.max(np.abs(tune))
    if max_val > 0:
        tune = tune / max_val
        
    fade_samples = int(sample_rate * 0.05)
    if len(tune) > fade_samples * 2:
        tune[:fade_samples] = tune[:fade_samples] * np.linspace(0, 1, fade_samples)
        tune[-fade_samples:] = tune[-fade_samples:] * np.linspace(1, 0, fade_samples)
    
    tune_int16 = np.int16(tune * 32767)
    return sample_rate, tune_int16

if __name__ == '__main__':
    with gr.Blocks(title="Mobile Game Tune Generator", theme=gr.themes.Base()) as demo:
        gr.Markdown("# 🎮 Mobile Game Vibe Tune Generator")
        gr.Markdown("Tweak the parameters below to generate a chiptune/retro style vibe tune for your mobile game! It uses math to synthesize old-school sounds.")
        
        with gr.Row():
            with gr.Column():
                bpm = gr.Slider(minimum=60, maximum=240, value=140, step=1, label="Tempo (BPM)")
                wave = gr.Dropdown(choices=['square', 'sawtooth', 'triangle', 'sine'], value='square', label="Waveform (Synth Type)")
                mood = gr.Dropdown(choices=['Happy (Major)', 'Sad (Minor)', 'Epic (Dorian)', 'Mysterious (Phrygian)', 'Upbeat (Pentatonic)'], value='Upbeat (Pentatonic)', label="Mood / Scale")
                measures = gr.Slider(minimum=1, maximum=16, value=4, step=1, label="Length (Measures)")
                randomness = gr.Slider(minimum=0.0, maximum=1.0, value=0.6, step=0.1, label="Melody Randomness")
                bass = gr.Checkbox(label="Enable Bassline", value=True)
                
                generate_btn = gr.Button("🎵 Generate Tune", variant="primary")
            
            with gr.Column():
                audio_output = gr.Audio(label="Generated Audio")
                
        generate_btn.click(
            generate_tune, 
            inputs=[bpm, wave, mood, measures, randomness, bass], 
            outputs=audio_output
        )

    demo.launch(server_name="127.0.0.1", server_port=7860)
