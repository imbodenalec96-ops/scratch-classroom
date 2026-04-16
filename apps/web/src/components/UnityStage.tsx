import React, { useEffect, useRef, useState } from "react";

const BUILD_PATH = "/unity-games/blockforge-stage/index.html";

declare global {
  interface Window {
    __unityStage?: { send: (obj: string, method: string, param: string) => void };
  }
}

const CS_TEMPLATE = `using UnityEngine;
using System;

/// <summary>
/// BlockForge Bridge — attach to a GameObject named "BlockController".
/// BlockForge calls these methods via SendMessage when students run Unity blocks.
/// </summary>
public class BlockController : MonoBehaviour
{
    [Header("Target (drag your player/object here)")]
    public Transform targetObject;

    void Start() { if (targetObject == null) targetObject = transform; }

    public void Move(string json)
    {
        var d = JsonUtility.FromJson<V3>(json);
        targetObject.position += new Vector3(d.x, d.y, d.z);
    }
    public void SetPosition(string json)
    {
        var d = JsonUtility.FromJson<V3>(json);
        targetObject.position = new Vector3(d.x, d.y, d.z);
    }
    public void Rotate(string json)
    {
        var d = JsonUtility.FromJson<RotP>(json);
        Vector3 ax = d.axis == "x" ? Vector3.right : d.axis == "z" ? Vector3.forward : Vector3.up;
        targetObject.Rotate(ax, d.degrees);
    }
    public void SetRotation(string json)
    {
        var d = JsonUtility.FromJson<V3>(json);
        targetObject.rotation = Quaternion.Euler(d.x, d.y, d.z);
    }
    public void SetScale(string json)
    {
        var d = JsonUtility.FromJson<ScaleP>(json);
        targetObject.localScale = Vector3.one * d.scale;
    }
    public void SetColor(string json)
    {
        var d = JsonUtility.FromJson<ColP>(json);
        var r = targetObject.GetComponent<Renderer>();
        if (r) r.material.color = new Color(d.r, d.g, d.b, d.a);
    }
    public void Spawn(string json)
    {
        var d = JsonUtility.FromJson<SpawnP>(json);
        var p = Resources.Load<GameObject>(d.prefab);
        if (p) Instantiate(p, new Vector3(d.x, d.y, d.z), Quaternion.identity);
    }
    public void PlayAnimation(string json)
    {
        var d = JsonUtility.FromJson<AnimP>(json);
        var a = targetObject.GetComponent<Animator>();
        if (a) a.Play(d.name);
    }
    public void ApplyForce(string json)
    {
        var d = JsonUtility.FromJson<V3>(json);
        var rb = targetObject.GetComponent<Rigidbody>();
        if (rb) rb.AddForce(new Vector3(d.x, d.y, d.z), ForceMode.Impulse);
    }
    public void SetGravity(string json)
    {
        var d = JsonUtility.FromJson<GravP>(json);
        Physics.gravity = new Vector3(0, -d.value, 0);
    }
    public void Say(string json)
    {
        var d = JsonUtility.FromJson<TextP>(json);
        Debug.Log("[BlockForge] " + d.text);
    }
    public void Reset(string _)
    {
        UnityEngine.SceneManagement.SceneManager.LoadScene(
            UnityEngine.SceneManagement.SceneManager.GetActiveScene().buildIndex);
    }

    [Serializable] class V3     { public float x, y, z; }
    [Serializable] class RotP   { public string axis = "y"; public float degrees; }
    [Serializable] class ScaleP { public float scale = 1; }
    [Serializable] class ColP   { public float r, g, b, a = 1; }
    [Serializable] class SpawnP { public string prefab; public float x, y, z; }
    [Serializable] class AnimP  { public string name; public float speed = 1; }
    [Serializable] class GravP  { public float value = 9.8f; }
    [Serializable] class TextP  { public string text; }
}`;

export default function UnityStage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [buildFound, setBuildFound] = useState<boolean | null>(null); // null = checking
  const [loaded, setLoaded] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [showScript, setShowScript] = useState(false);

  // Check whether a real Unity build exists (not just the SPA catch-all).
  // Vercel rewrites all paths to index.html (200), so a HEAD check always
  // succeeds. Instead, fetch the content and look for Unity-specific strings.
  useEffect(() => {
    fetch(BUILD_PATH)
      .then(r => r.text())
      .then(text => {
        const isUnity = text.includes("UnityLoader") || text.includes("unityInstance") || text.includes("UnityWebGL") || text.includes("createUnityInstance");
        setBuildFound(isUnity);
      })
      .catch(() => setBuildFound(false));
  }, []);

  // Register the global bridge so runtime.ts can call into Unity
  useEffect(() => {
    window.__unityStage = {
      send: (objectName: string, method: string, param: string) => {
        try {
          const iwin = iframeRef.current?.contentWindow as any;
          if (iwin?.unityInstance?.SendMessage) {
            iwin.unityInstance.SendMessage(objectName, method, param);
          }
        } catch { /* cross-origin guard */ }
      },
    };
    return () => { delete window.__unityStage; };
  }, []);

  const copyScript = () => {
    navigator.clipboard.writeText(CS_TEMPLATE).then(() => {
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    });
  };

  if (buildFound === null) {
    // Checking...
    return (
      <div className="flex flex-col items-center justify-center rounded-xl" style={{ height: 360, background: "#07071a", border: "1px solid rgba(34,211,238,0.2)" }}>
        <div className="w-6 h-6 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin mb-2" />
        <span className="text-white/30 text-xs">Checking for Unity build…</span>
      </div>
    );
  }

  if (!buildFound) {
    return (
      <div className="rounded-xl overflow-hidden flex flex-col" style={{ height: 360, background: "#07071a", border: "1px solid rgba(34,211,238,0.25)" }}>
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2" style={{ background: "rgba(34,211,238,0.08)", borderBottom: "1px solid rgba(34,211,238,0.15)" }}>
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-xs font-bold" style={{ color: "#22d3ee" }}>Unity Stage — Setup Required</span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Steps */}
          <div className="space-y-2">
            {[
              { n: 1, text: "In Unity: File → Build Settings → WebGL → Build" },
              { n: 2, text: "Copy build output to apps/web/public/unity-games/blockforge-stage/" },
              { n: 3, text: 'Add "BlockController" script to your scene (copy below)' },
              { n: 4, text: "Deploy → Unity stage appears here automatically" },
            ].map(s => (
              <div key={s.n} className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold" style={{ background: "rgba(34,211,238,0.2)", color: "#22d3ee", marginTop: 1 }}>{s.n}</span>
                <span className="text-[11px] text-white/55 leading-tight">{s.text}</span>
              </div>
            ))}
          </div>

          {/* Script toggle */}
          <div>
            <button
              onClick={() => setShowScript(v => !v)}
              className="flex items-center gap-1.5 text-[11px] font-semibold transition-colors"
              style={{ color: showScript ? "#22d3ee" : "rgba(255,255,255,0.4)" }}
            >
              <span style={{ transform: showScript ? "rotate(90deg)" : "rotate(0deg)", display: "inline-block", transition: "transform 0.15s" }}>▶</span>
              BlockController.cs — copy into your Unity project
            </button>

            {showScript && (
              <div className="mt-2 relative">
                <pre className="text-[9px] leading-relaxed overflow-x-auto p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#a78bfa", maxHeight: 180, fontFamily: "monospace" }}>
                  {CS_TEMPLATE}
                </pre>
                <button
                  onClick={copyScript}
                  className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold transition-all"
                  style={{ background: copiedScript ? "rgba(34,197,94,0.3)" : "rgba(34,211,238,0.2)", color: copiedScript ? "#4ade80" : "#22d3ee", border: `1px solid ${copiedScript ? "rgba(34,197,94,0.4)" : "rgba(34,211,238,0.3)"}` }}
                >
                  {copiedScript ? "✓ Copied!" : "Copy"}
                </button>
              </div>
            )}
          </div>

          <p className="text-[10px] text-white/25 leading-relaxed">
            Unity blocks in the editor work immediately — once your build is deployed, they send <code className="text-cyan-400">SendMessage</code> calls to <code className="text-cyan-400">BlockController</code> in your scene.
          </p>
        </div>
      </div>
    );
  }

  // Build found — show the Unity iframe
  return (
    <div className="relative rounded-xl overflow-hidden flex flex-col" style={{ height: 360, background: "#07071a", border: "1px solid rgba(34,211,238,0.3)" }}>
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10" style={{ background: "#07071a" }}>
          <div className="text-3xl">🎮</div>
          <div className="text-white font-bold text-sm">Loading Unity scene…</div>
          <div className="w-40 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div className="h-full rounded-full animate-pulse" style={{ width: "55%", background: "#22d3ee" }} />
          </div>
          <div className="text-white/25 text-[10px]">Large builds may take a moment</div>
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0" style={{ background: "rgba(34,211,238,0.08)", borderBottom: "1px solid rgba(34,211,238,0.12)" }}>
        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" style={{ boxShadow: "0 0 6px #22d3ee" }} />
        <span className="text-[10px] font-bold" style={{ color: "#22d3ee" }}>Unity Stage — Live</span>
        <span className="text-[9px] text-white/25 ml-auto">Blocks send to BlockController via SendMessage</span>
      </div>

      <iframe
        ref={iframeRef}
        src={BUILD_PATH}
        className="flex-1 w-full"
        style={{ border: "none", opacity: loaded ? 1 : 0, transition: "opacity 0.4s ease" }}
        allow="autoplay; fullscreen; microphone; pointer-lock"
        sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms"
        onLoad={() => setLoaded(true)}
        title="Unity Stage"
      />
    </div>
  );
}
