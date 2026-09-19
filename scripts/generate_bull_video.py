#!/usr/bin/env python3
"""
StreetFun - Cinematic Ambient Bull Video Generator v2
- Mathematical zero-seam circular looping (3-tile periodic coordinate mapping)
- Rich, dense, visible volumetric fog rolling through the Wall Street skyscraper canyon
- Realistic ground fog banks & foreground wisps curling across the bull
- Organic breathing heave with zero glasses deformation
- Seamless nostril steam timing (completely quiet at loop seam)
"""

import os
import sys
import math
import subprocess
import numpy as np
from PIL import Image
import scipy.ndimage as ndimage

WIDTH = 1880
HEIGHT = 836
FPS = 30
DURATION_SEC = 6.0
TOTAL_FRAMES = int(FPS * DURATION_SEC) # 180 frames

OUTPUT_DIR = "public/generated"
TEMP_FRAMES_DIR = "/tmp/streetfun_bull_frames"

def make_periodic_noise(gh, gw, sigma=(2.5, 4.0), seed=42):
    """Generate a 3-tile horizontally periodic noise field with 0.0 boundary error."""
    np.random.seed(seed)
    raw = np.random.randn(gh, gw).astype(np.float32)
    smooth = ndimage.gaussian_filter(raw, sigma=sigma, mode='wrap')
    # Normalize 0..1
    smooth = (smooth - smooth.min()) / (smooth.max() - smooth.min() + 1e-6)
    # Return 3-tile grid for smooth wrapped interpolation
    return np.hstack([smooth, smooth, smooth]), gh, gw

def sample_periodic_fog(tiled, gh, gw, y_coords, x_coords, shift_x, shift_y=0.0):
    """Sample from periodic 3-tile grid with exact floating-point coordinate wrapping."""
    zy = (gh - 1) / float(HEIGHT)
    zx = float(gw) / float(WIDTH)
    
    # Wrap x seamlessly within the center tile [gw, 2*gw]
    wrapped_x = gw + ((x_coords + shift_x) * zx) % gw
    sample_y = np.clip((y_coords + shift_y) * zy, 0, gh - 1)
    
    return ndimage.map_coordinates(tiled, [sample_y, wrapped_x], order=2, mode='nearest')

def main():
    print(f"🎬 Initializing Bull Video Generation v2: {WIDTH}x{HEIGHT} @ {FPS}fps ({TOTAL_FRAMES} frames)...")
    os.makedirs(TEMP_FRAMES_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 1. Load source assets
    base_img = Image.open(os.path.join(OUTPUT_DIR, "hero-bull-brand-glasses.png")).convert("RGB")
    base_arr = np.array(base_img)[:HEIGHT, :WIDTH].astype(np.float32)

    fg_img = Image.open(os.path.join(OUTPUT_DIR, "hero-bull-foreground.png")).convert("RGBA")
    fg_arr = np.array(fg_img)[:HEIGHT, :WIDTH].astype(np.float32)
    bull_mask = fg_arr[:, :, 3] / 255.0

    bull_mask_smooth = ndimage.gaussian_filter(bull_mask, sigma=2.0)
    city_mask = 1.0 - bull_mask_smooth

    y_coords, x_coords = np.mgrid[0:HEIGHT, 0:WIDTH]

    # 2. Breathing displacement map
    # Chest and lower torso (x: 1050..1880, y: 550..836)
    body_weight = np.clip((y_coords - 530) / 220.0, 0.0, 1.0) * (x_coords > 1050).astype(np.float32)
    flank_weight = np.clip((x_coords - 1450) / 300.0, 0.0, 1.0) * np.clip((y_coords - 340) / 320.0, 0.0, 1.0)
    breath_weight = np.maximum(body_weight, flank_weight) * bull_mask_smooth
    
    # Lock sunglasses strictly to 0
    glasses_mask = ((x_coords >= 1050) & (x_coords <= 1540) & (y_coords >= 320) & (y_coords <= 535)).astype(np.float32)
    glasses_mask = ndimage.gaussian_filter(glasses_mask, sigma=10.0)
    breath_weight = breath_weight * (1.0 - np.clip(glasses_mask * 1.8, 0.0, 1.0))

    # 3. Generate multi-scale periodic fog fields
    print("🌫️ Generating dense multi-scale periodic fog textures...")
    # Background deep canyon fog: slow rolling large billows (1 period shift over full loop)
    fog1_tile, gh1, gw1 = make_periodic_noise(40, 80, sigma=(3.0, 5.0), seed=101)
    # Background fast low street fog: medium billows (2 periods shift over full loop)
    fog2_tile, gh2, gw2 = make_periodic_noise(50, 100, sigma=(2.0, 3.5), seed=202)
    # Foreground drifting wisps (1 period shift over full loop)
    fog_fg_tile, gh_fg, gw_fg = make_periodic_noise(45, 90, sigma=(2.5, 4.0), seed=303)
    # High-frequency smoke details (2 periods shift)
    fog_detail_tile, gh_det, gw_det = make_periodic_noise(70, 140, sigma=(1.5, 2.5), seed=404)

    nostril_left = (1160, 608)
    nostril_right = (1355, 602)

    print("🎥 Rendering frames...")

    for i in range(TOTAL_FRAMES):
        t = i / float(TOTAL_FRAMES) # 0.0 to 1.0
        phase = 2.0 * math.pi * t

        # A. Breathing heave (smooth sine)
        breath_cycle = math.sin(phase)
        dy = breath_weight * (breath_cycle * 3.2) # 3.2px heave
        dx = breath_weight * (breath_cycle * 1.0) # 1.0px expansion

        map_y = np.clip(y_coords - dy, 0, HEIGHT - 1)
        map_x = np.clip(x_coords - dx, 0, WIDTH - 1)

        frame = np.zeros_like(base_arr)
        for c in range(3):
            frame[:, :, c] = ndimage.map_coordinates(base_arr[:, :, c], [map_y, map_x], order=1, mode='nearest')

        # B. Dense Skyscraper Canyon Fog (Background)
        # Shift 1: Exactly 1.0 * WIDTH over the loop -> perfectly seamless
        shift1 = t * 1.0 * WIDTH
        # Shift 2: Exactly 2.0 * WIDTH over the loop -> perfectly seamless
        shift2 = t * 2.0 * WIDTH

        f1 = sample_periodic_fog(fog1_tile, gh1, gw1, y_coords, x_coords, shift1)
        f2 = sample_periodic_fog(fog2_tile, gh2, gw2, y_coords, x_coords, shift2)
        f_det = sample_periodic_fog(fog_detail_tile, gh_det, gw_det, y_coords, x_coords, shift2)

        # Composite background canyon fog with organic billowy curves
        canyon_fog = (f1 * 0.55 + f2 * 0.30 + f_det * 0.15)
        canyon_fog = np.clip((canyon_fog - 0.32) / 0.68, 0.0, 1.0) ** 1.4

        # Vertical distribution: subtle in the mid canyon
        canyon_density = np.clip((y_coords - 150) / 450.0, 0.0, 1.0) * np.clip((820 - y_coords) / 250.0, 0.2, 1.0)
        
        # Fog color: subtle, dark atmospheric mist (reduced from 0.78 to 0.25)
        fog_bg_intensity = canyon_fog * canyon_density * city_mask * 0.25
        
        for c, (c_base, c_hi) in enumerate([(15.0, 30.0), (22.0, 42.0), (28.0, 52.0)]):
            fog_col = c_base + canyon_fog * (c_hi - c_base)
            frame[:, :, c] += fog_bg_intensity * fog_col

        # C. Ground Rolling Fog Bank (Street level across whole bottom - very subtle)
        ground_shift = t * 1.0 * WIDTH
        fg_ground = sample_periodic_fog(fog_fg_tile, gh_fg, gw_fg, y_coords, x_coords, ground_shift)
        ground_mask = np.clip((y_coords - 550) / 240.0, 0.0, 1.0) ** 1.8
        ground_intensity = np.clip((fg_ground - 0.35) / 0.65, 0.0, 1.0) * ground_mask * 0.16

        for c, col in enumerate([18.0, 24.0, 32.0]):
            frame[:, :, c] += ground_intensity * col

        # D. Foreground Wisps Across the Bull (Extremely faint)
        fg_wisp_shift = t * 1.0 * WIDTH
        fg_wisp = sample_periodic_fog(fog_fg_tile, gh_fg, gw_fg, y_coords, x_coords, fg_wisp_shift, shift_y=math.sin(phase)*10.0)
        wisp_clouds = np.clip((fg_wisp - 0.58) / 0.42, 0.0, 1.0) ** 2.2
        horn_wisp_zone = ((y_coords > 120) & (y_coords < 380) & (x_coords > 900) & (x_coords < 1500)).astype(np.float32)
        chest_wisp_zone = ((y_coords > 550) & (y_coords < 800) & (x_coords > 1050)).astype(np.float32)
        wisp_zone = ndimage.gaussian_filter(horn_wisp_zone * 0.25 + chest_wisp_zone * 0.5, sigma=18.0)
        
        wisp_intensity = wisp_clouds * wisp_zone * 0.12
        for c, col in enumerate([24.0, 32.0, 42.0]):
            frame[:, :, c] += wisp_intensity * col

        # E. Nostril Steam Condensation Puffs (Soft, subtle)
        if 0.45 <= t <= 0.85:
            steam_t = (t - 0.45) / 0.40 # 0.0 to 1.0
            steam_intensity = (math.sin(steam_t * math.pi) ** 2.0) * 0.18
            
            drift_prog = steam_t * 18.0
            puff_radius_x = 20.0 + steam_t * 18.0
            puff_radius_y = 14.0 + steam_t * 14.0
            
            steam_map = np.zeros((HEIGHT, WIDTH), dtype=np.float32)
            for n_idx, (nx, ny) in enumerate([nostril_left, nostril_right]):
                dx_sign = -1.0 if n_idx == 0 else 1.0
                cx = nx + dx_sign * (5.0 + drift_prog * 0.3)
                cy = ny + 16.0 + drift_prog
                
                dist = np.sqrt(((x_coords - cx) / puff_radius_x)**2 + ((y_coords - cy) / puff_radius_y)**2)
                puff = np.clip(1.0 - dist, 0.0, 1.0) ** 1.8
                steam_map += puff
            
            steam_map = ndimage.gaussian_filter(steam_map, sigma=4.0) * steam_intensity
            for c, col in enumerate([45.0, 58.0, 70.0]):
                frame[:, :, c] += steam_map * col

        # F. Subtle Window Ambient Shimmer (2 cycles over loop -> perfectly seamless)
        shimmer = (math.sin(phase * 2.0) * 0.5 + 0.5) * 0.08 + 0.96
        frame[:, :1000] = np.clip(frame[:, :1000] * shimmer, 0, 255)

        # Final bounds clamp
        frame_final = np.clip(frame, 0, 255).astype(np.uint8)

        frame_path = os.path.join(TEMP_FRAMES_DIR, f"frame_{i:04d}.png")
        Image.fromarray(frame_final).save(frame_path)

        if (i + 1) % 30 == 0 or i == TOTAL_FRAMES - 1:
            sys.stdout.write(f"\rRendered {i+1}/{TOTAL_FRAMES} frames ({int((i+1)/TOTAL_FRAMES*100)}%)")
            sys.stdout.flush()

    print("\n\nEncoding MP4 (H.264, high profile, faststart)...")
    mp4_out = os.path.join(OUTPUT_DIR, "hero-bull-video.mp4")
    ffmpeg_cmd_mp4 = [
        "ffmpeg", "-y",
        "-framerate", str(FPS),
        "-i", os.path.join(TEMP_FRAMES_DIR, "frame_%04d.png"),
        "-c:v", "libx264",
        "-profile:v", "high",
        "-pix_fmt", "yuv420p",
        "-crf", "19",
        "-preset", "slow",
        "-movflags", "+faststart",
        mp4_out
    ]
    subprocess.run(ffmpeg_cmd_mp4, check=True)
    print(f"Generated {mp4_out} ({os.path.getsize(mp4_out) / 1024 / 1024:.2f} MB)")

    print("\nEncoding WebM (VP9)...")
    webm_out = os.path.join(OUTPUT_DIR, "hero-bull-video.webm")
    ffmpeg_cmd_webm = [
        "ffmpeg", "-y",
        "-framerate", str(FPS),
        "-i", os.path.join(TEMP_FRAMES_DIR, "frame_%04d.png"),
        "-c:v", "libvpx-vp9",
        "-pix_fmt", "yuv420p",
        "-crf", "24",
        "-b:v", "0",
        "-deadline", "good",
        webm_out
    ]
    subprocess.run(ffmpeg_cmd_webm, check=True)
    print(f"Generated {webm_out} ({os.path.getsize(webm_out) / 1024 / 1024:.2f} MB)")

    for f in os.listdir(TEMP_FRAMES_DIR):
        os.remove(os.path.join(TEMP_FRAMES_DIR, f))
    os.rmdir(TEMP_FRAMES_DIR)
    print("Done! Video files ready.")

if __name__ == "__main__":
    main()
