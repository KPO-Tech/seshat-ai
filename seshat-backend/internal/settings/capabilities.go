package settings

import "strings"

// Capability is a non-chat feature whose credential can be reused from an
// already-configured chat provider (see internal/db/capability_links.go).
// Every provider type implicitly supports "chat" - that's not modeled here.
type Capability string

const (
	CapabilityImage      Capability = "image"
	CapabilityAudio      Capability = "audio"
	CapabilityEmbeddings Capability = "embeddings"
)

func (c Capability) Valid() bool {
	switch c {
	case CapabilityImage, CapabilityAudio, CapabilityEmbeddings:
		return true
	default:
		return false
	}
}

// capableProviders lists, for each capability, which provider_settings.Provider
// type strings this app actually has integration code for on that capability
// today - deliberately not a speculative full matrix:
//   - image: internal/config/bootstrap.go's defaultImageGenerationConfig
//     (OpenAI DALL-E, Gemini image generation)
//   - audio: defaultTextToSpeechConfig/defaultSpeechToTextConfig
//     (OpenAI Whisper/TTS only - no Gemini audio integration exists)
//   - embeddings: the embedder only implements openai and ollama
//     (github.com/KPO-Tech/seshat/internal/rag/embedder), and ollama needs
//     no API key (auth_kind "none"), so there's nothing to link for it.
var capableProviders = map[Capability]map[string]bool{
	CapabilityImage:      {"openai": true, "gemini": true},
	CapabilityAudio:      {"openai": true},
	CapabilityEmbeddings: {"openai": true},
}

// SupportsCapability reports whether a configured provider's type is known
// to support reuse for the given non-chat capability.
func SupportsCapability(providerType string, capability Capability) bool {
	return capableProviders[capability][strings.ToLower(strings.TrimSpace(providerType))]
}
