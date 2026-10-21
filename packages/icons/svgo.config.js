export default {
  multipass: true,
  plugins: [
    'removeDimensions',
    'removeXMLNS',
    'cleanupAttrs',
    'collapseGroups',
    {
      name: 'removeAttrs',
      params: {
        // Mantém fill="none"/stroke="currentColor" dos traços (Penpot):
        // sem eles, um path aberto renderiza preenchido
        attrs: '*:(fill|stroke):(?!none$|currentColor$).*',
      },
    },
  ],
};
