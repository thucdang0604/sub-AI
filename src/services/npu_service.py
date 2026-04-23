import sys
import json
import traceback
import torch
import torch.nn.functional as F
from optimum.intel import OVModelForFeatureExtraction
from transformers import AutoTokenizer

def main():
    sys.stdin.reconfigure(encoding='utf-8', errors='replace')
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    
    # Path to the exported OpenVINO model
    model_id = r"M:\model-ai\npu\bge-m3-openvino"
    
    try:
        tokenizer = AutoTokenizer.from_pretrained(model_id)
        # NPU requires static shapes
        model = OVModelForFeatureExtraction.from_pretrained(model_id)
        model.reshape(1, 512)
        model.to("NPU")
        model.compile()
        
        print(json.dumps({"status": "ready"}))
        sys.stdout.flush()
    except Exception as e:
        err_msg = traceback.format_exc()
        print(json.dumps({"status": "error", "message": str(e), "trace": err_msg}))
        sys.stdout.flush()
        sys.exit(1)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
            
        try:
            req = json.loads(line)
            req_type = req.get("type", "document")
            texts = req.get("texts", [])
            
            embeddings = []
            for text in texts:
                # Add query instruction for BGE model if it's a query
                if req_type == "query":
                    text = "Represent this sentence for searching relevant passages: " + text
                    
                inputs = tokenizer(text, return_tensors='pt', padding='max_length', max_length=512, truncation=True)
                
                # Inference on NPU
                outputs = model(**inputs)
                
                # Pooling (CLS token)
                sentence_embedding = outputs.last_hidden_state[:, 0]
                sentence_embedding = F.normalize(sentence_embedding, p=2, dim=1)
                
                embeddings.append(sentence_embedding[0].tolist())
            
            print(json.dumps({
                "status": "success",
                "embeddings": embeddings
            }))
            sys.stdout.flush()
            
        except Exception as e:
            err_msg = traceback.format_exc()
            print(json.dumps({
                "status": "error",
                "message": str(e),
                "trace": err_msg
            }))
            sys.stdout.flush()

if __name__ == "__main__":
    main()
