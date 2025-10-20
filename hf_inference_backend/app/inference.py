import os
import torch
import numpy as np
from huggingface_hub import hf_hub_download

class SimpleMLP(torch.nn.Module):
    def __init__(self, in_dim, num_classes, hidden_dim=256):
        super().__init__()
        self.net = torch.nn.Sequential(
            torch.nn.Linear(in_dim, hidden_dim),
            torch.nn.ReLU(),
            torch.nn.Linear(hidden_dim, num_classes),
        )

    def forward(self, x):
        return self.net(x)

class InferenceService:
    def __init__(self):
        self.repo_id = os.getenv("MODEL_REPO_ID", "")
        self.filename = os.getenv("MODEL_FILENAME", "pytorch_model.bin")
        self.family_labels = os.getenv("FAMILY_LABELS", "FAMILY_A,FAMILY_B,FAMILY_C").split(",")
        self.in_dim = int(os.getenv("INPUT_DIM", "768"))
        hidden_dim = int(os.getenv("HIDDEN_DIM", "256"))

        self.model = SimpleMLP(in_dim=self.in_dim, num_classes=len(self.family_labels), hidden_dim=hidden_dim)

        try:
            ckpt_path = hf_hub_download(repo_id=self.repo_id, filename=self.filename)
            state = torch.load(ckpt_path, map_location="cpu")
            self.model.load_state_dict(state)
        except Exception as e:
            print("⚠️ Warning: failed to load model weights:", e)

        self.model.eval()

    @torch.inference_mode()
    def predict(self, X: np.ndarray):
        x = torch.tensor(X, dtype=torch.float32)
        logits = self.model(x)
        probs = torch.softmax(logits, dim=-1).numpy()
        preds = probs.argmax(axis=-1)
        return {
            "probs": probs,
            "pred_labels": [self.family_labels[i] for i in preds],
            "labels": self.family_labels,
        }
