"""A Drawing collects what one mark needs: its gradients, its shapes, its extent."""
from __future__ import annotations

from dataclasses import dataclass, field

from . import svg
from .surface import Surface, gradient_def


@dataclass
class Drawing:
    surface: Surface
    viewbox: tuple[float, float]                      # (width, height), origin at 0,0
    bbox: tuple[float, float, float, float]           # content extent, used to fit tiles
    body: list[str] = field(default_factory=list)
    _gradients: dict[str, str] = field(default_factory=dict)
    _raw: dict[str, str] = field(default_factory=dict)

    def grad(self, name: str) -> str:
        """Reference a gradient by name, registering its definition once."""
        if name not in self._gradients:
            self._gradients[name] = gradient_def(name, self.surface)
        return f"url(#{name})"

    def paint(self, gradient: str) -> str:
        """A gradient reference, or the one flat colour in a mono drawing."""
        return self.surface.mono if self.surface.is_mono else self.grad(gradient)

    def raw_def(self, name: str, markup: str) -> None:
        """Register a non-gradient definition (a mask) once, by name."""
        self._raw.setdefault(name, markup)

    def add(self, *shapes: str) -> None:
        self.body.extend(shapes)

    @property
    def defs(self) -> list[str]:
        return [*self._gradients.values(), *self._raw.values()]

    def document(self, label: str) -> str:
        w, h = self.viewbox
        return svg.document((0, 0, w, h), self.body, defs=self.defs, label=label)

    def inner(self) -> tuple[list[str], list[str]]:
        """(defs, body) for embedding in a larger document."""
        return self.defs, list(self.body)
