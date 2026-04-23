import os
import subprocess
import sys
from pathlib import Path

def main():
    root_dir = Path(__file__).parent.absolute()
    cache_dir = root_dir / ".ai_cache"
    cache_dir.mkdir(exist_ok=True)
    
    venv_dir = cache_dir / "venv"
    
    if not venv_dir.exists():
        print(f"[*] Creating Virtual Environment at {venv_dir}...")
        subprocess.run([sys.executable, "-m", "venv", str(venv_dir)], check=True)
    else:
        print(f"[*] Virtual Environment already exists at {venv_dir}")
    
    # Path to pip inside venv
    if os.name == 'nt':
        pip_exe = venv_dir / "Scripts" / "pip.exe"
        python_exe = venv_dir / "Scripts" / "python.exe"
    else:
        pip_exe = venv_dir / "bin" / "pip"
        python_exe = venv_dir / "bin" / "python"
        
    print("[*] Upgrading pip...")
    subprocess.run([str(python_exe), "-m", "pip", "install", "-U", "pip"], check=True)
    
    print("[*] Installing dependencies into venv (openvino, openvino-genai, optimum-intel)...")
    subprocess.run([
        str(pip_exe), "install", 
        "openvino>=2024.1.0", 
        "openvino-genai", 
        "optimum-intel", 
        "transformers", 
        "numpy"
    ], check=True)
    
    print("\n[*] Verifying OpenVINO installation and NPU availability...")
    result = subprocess.run(
        [str(python_exe), "-c", "import openvino as ov; print(ov.Core().available_devices)"],
        capture_output=True,
        text=True
    )
    print(f"Available Devices: {result.stdout.strip()}")
    
    if "NPU" in result.stdout:
        print("\n[+] SUCCESS: NPU is available and ready for use!")
    else:
        print("\n[-] WARNING: NPU not found in available devices. Please check your Intel drivers.")

if __name__ == "__main__":
    main()
