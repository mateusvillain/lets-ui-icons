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
        attrs: '(fill|stroke)',
      },
    },
  ],
};
